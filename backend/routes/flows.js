const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const FormData = require('form-data');
const { runFlow } = require('../middleware/langflow');

// ─── Flow IDs ────────────────────────────────────────────────────────────────
const FLOWS = {
  KONSULTAN_RESELL:         process.env.FLOW_KONSULTAN_RESELL,
  REKOMENDASI_HARGA:        process.env.FLOW_REKOMENDASI_HARGA,
  DESKRIPSI_CAPTION:        process.env.FLOW_DESKRIPSI_CAPTION,
  PERBANDINGAN_HARGA:       process.env.FLOW_PERBANDINGAN_HARGA_BELI_JUAL,
  PERBANDINGAN_MARKETPLACE: process.env.FLOW_PERBANDINGAN_MARKETPLACE,
  KONSULTASI_ONGKIR:        process.env.FLOW_KONSULTASI_ONGKIR,
  FOTO_VALIDATOR:           process.env.FLOW_FOTO_VALIDATOR,
  FOTO_EDITOR:              process.env.FLOW_FOTO_EDITOR
};

// ─── Helper ──────────────────────────────────────────────────────────────────
function buildPrompt(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

const MAX_PHOTO_BYTES = 7 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const PHOTO_BACKGROUNDS = {
  solid: 'Latar warna solid bersih sesuai kode warna pilihan.',
  'studio-cream': 'Studio produk minimalis dengan latar seamless krem hangat.',
  'studio-cool': 'Studio produk minimalis dengan latar abu-abu muda bernuansa sejuk.',
  'marketplace-white': 'Latar katalog marketplace putih bersih tanpa elemen tambahan.',
  'lifestyle-warm': 'Interior lifestyle minimalis bernuansa hangat, rapi, dan tidak mengalihkan fokus dari produk.',
  'custom-image': 'Foto latar kustom yang diunggah oleh pengguna.'
};

function isImageType(mimeType, bytes) {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return mimeType === 'image/webp'
    && bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP';
}

function detectImageMimeType(bytes) {
  return ['image/png', 'image/jpeg', 'image/webp'].find(mimeType => isImageType(mimeType, bytes)) || null;
}

function validatePhotoDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(IMAGE_DATA_URL);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const mimeType = `image/${match[1]}`;
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES || !isImageType(mimeType, bytes)) return null;
  return { dataUrl: value, mimeType, bytes };
}

function parsePhotoFlowJson(result) {
  const text = String(result || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Respons flow harus berupa objek JSON.');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Respons flow foto bukan JSON yang valid: ${err.message}`);
  }
}

function photoFlowUnavailable(res, flowId) {
  if (flowId && flowId.trim()) return false;
  res.status(503).json({ error: 'Flow foto belum dikonfigurasi. Isi FLOW_FOTO_VALIDATOR dan FLOW_FOTO_EDITOR di backend/config.env.' });
  return true;
}

function normalizedValidatorResult(result) {
  // Primary: new schema — scan_validation_context_id
  const ctx = result.scan_validation_context_id && typeof result.scan_validation_context_id === 'object'
    ? result.scan_validation_context_id
    : null;

  if (ctx) {
    return {
      accepted: ctx.is_valid_item === true,
      is_valid_item: ctx.is_valid_item === true,
      identified_item: typeof ctx.identified_item_name === 'string' ? ctx.identified_item_name : '',
      item_category: typeof ctx.item_category === 'string' ? ctx.item_category : '',
      suggested_backgrounds: Array.isArray(ctx.suggested_backgrounds) ? ctx.suggested_backgrounds : [],
      reason: typeof ctx.rejection_reason === 'string' && ctx.rejection_reason
        ? ctx.rejection_reason
        : (ctx.is_valid_item === false ? 'Foto tidak mengandung barang yang dapat dijual.' : '')
    };
  }

  // Fallback: legacy schema
  const scanned = result.scanned_item && typeof result.scanned_item === 'object'
    ? result.scanned_item : result;
  const isValid = scanned.is_valid_object === true || scanned.is_valid === true || scanned.is_valid_item === true;
  const isSellable = scanned.is_sellable === true || scanned.is_suitable === true;
  return {
    accepted: isValid && isSellable,
    is_valid_item: isValid && isSellable,
    identified_item: typeof scanned.identified_item_name === 'string' ? scanned.identified_item_name
      : (typeof scanned.identified_item === 'string' ? scanned.identified_item : ''),
    item_category: typeof scanned.item_category === 'string' ? scanned.item_category : '',
    suggested_backgrounds: Array.isArray(scanned.suggested_backgrounds) ? scanned.suggested_backgrounds : [],
    reason: typeof scanned.rejection_reason === 'string' ? scanned.rejection_reason
      : (typeof scanned.reason === 'string' ? scanned.reason
      : (typeof scanned.message === 'string' ? scanned.message : ''))
  };
}

function normalizeEditedImage(value) {
  if (typeof value !== 'string') return null;
  const dataUrlMatch = value.match(IMAGE_DATA_URL);
  if (dataUrlMatch) {
    const bytes = Buffer.from(dataUrlMatch[2], 'base64');
    const mimeType = `image/${dataUrlMatch[1]}`;
    return bytes.length && bytes.length <= 12 * 1024 * 1024 && isImageType(mimeType, bytes) ? value : null;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  const mimeType = detectImageMimeType(bytes);
  if (!bytes.length || bytes.length > 12 * 1024 * 1024 || !mimeType) return null;
  return `data:${mimeType};base64,${value}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// A. RISET BARANG
// ══════════════════════════════════════════════════════════════════════════════

// ─── A1. Konsultan Pembelian (Perbandingan Harga Beli & Jual) ─────────────────
router.post('/konsultan-pembelian', async (req, res) => {
  try {
    const { productName, buyPrice, condition, specs, repairCost, marketplace } = req.body;
    if (!productName || !buyPrice) {
      return res.status(400).json({ error: 'Nama Produk dan Harga Beli wajib diisi.' });
    }

    const detail_barang = buildPrompt({
      'Nama Produk'             : productName,
      'Harga Beli (Asking)'     : `${Number(buyPrice)}`,
      'Kondisi Produk'          : condition || 'Normal bekas',
      'Spesifikasi'             : specs || '-',
      'Biaya Perbaikan/Upgrade' : repairCost ? `${Number(repairCost)}` : '0',
      'Marketplace Target'      : marketplace || 'Facebook Marketplace'
    });

    const systemPrompt =
`Kamu adalah Analis Bisnis Thrifting & Secondhand Flipping Expert di Indonesia. Tugasmu adalah mengevaluasi kelayakan pembelian barang bekas secara cepat, presisi, dan berbasis data.

Informasi Input:
${detail_barang}

Aturan Output:
1. Hindari kata pembuka/penutup basa-basi.
2. Gunakan bahasa yang lugas dan profesional.
3. Semua nominal menggunakan angka murni (tanpa Rp/titik/koma) khusus pada output JSON, dan format Rupiah (Rp) pada teks Markdown.
4. Kamu WAJIB memberikan 2 bagian output: Ringkasan Teks (Markdown) dan Data Terstruktur (JSON Code Block).

--- FORMAT OUTPUT TEKS (UNTUK USER) ---

1. IDENTIFIKASI CONDITION & MINUS
- Minus Visual/Sistem: [Daftar minus]
- Biaya Perbaikan: Rp [Nominal]
- Status Penjualan: [Wajib Servis Dulu / Bisa Penjualan Apa Adanya]

2. KALKULASI FINANSIAL
- Harga Beli (Asking): Rp [Nominal]
- Biaya Perbaikan: Rp [Nominal]
- Total Modal (COGS): Rp [Nominal]
- Estimasi Harga Jual Pasar: Rp [Nominal]
- Potensi Profit Bersih: Rp [Nominal]
- Estimasi ROI (%): [Nilai %]

3. KEPUTUSAN FINAL
- Status: [🟢 RECOMMENDED / 🟡 RISKY / 🔴 SKIP]
- Alasan Utama: [1-2 kalimat alasan]

4. STRATEGI NEGO
- Harga Nego Target: Rp [Nominal]
- Target ROI Setelah Nego: [Nilai %]
- Argumen Nego: [Poin alasan nego singkat]

--- FORMAT OUTPUT JSON (UNTUK SYSTEM PARSER) ---
Di bagian paling bawah, selalu sertakan JSON block dengan tag \`\`\`json ... \`\`\` dan struktur atribut berikut:

\`\`\`json
{
  "context_id": {
    "item_name": "string",
    "asking_price": number,
    "repair_cost": number,
    "total_cost": number,
    "market_price": number,
    "estimated_profit": number,
    "roi_percentage": number,
    "decision_status": "RECOMMENDED",
    "decision_color": "#22C55E",
    "repair_required": false,
    "risk_level": "LOW",
    "target_nego_price": number,
    "target_roi_after_nego": number,
    "nego_reasoning": ["string"]
  }
}
\`\`\``;

    const result = await runFlow(FLOWS.PERBANDINGAN_HARGA, systemPrompt);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[konsultan-pembelian]', err.message);
    res.status(500).json({ error: 'Gagal menghubungi AI. Pastikan Langflow aktif.' });
  }
});

// ─── A2. Penilai Harga Jual (Rekomendasi Harga) ───────────────────────────────
router.post('/penilai-harga', async (req, res) => {
  try {
    const { productName, specs, condition, defects, buyPrice } = req.body;
    if (!productName) {
      return res.status(400).json({ error: 'Nama Produk wajib diisi.' });
    }

    const detail_barang = buildPrompt({
      'Nama Produk'        : productName,
      'Spesifikasi'        : specs        || '-',
      'Kondisi'            : condition    || 'Normal bekas',
      'Kekurangan / Minus' : defects      || 'Tidak ada',
      'Harga Beli'         : buyPrice ? `Rp ${Number(buyPrice).toLocaleString('id-ID')}` : 'Tidak diketahui'
    });

    const systemPrompt =
`Kamu adalah Penilai Harga Jual barang bekas & refurbished Expert di Indonesia. Tugasmu adalah menentukan harga jual optimal berdasarkan kondisi, minus, dan data pasar.

Informasi Barang:
${detail_barang}

Aturan Output:
1. Hindari kata pembuka/penutup basa-basi.
2. Gunakan bahasa yang lugas dan profesional.
3. Semua nominal menggunakan angka murni (tanpa Rp/titik/koma) KHUSUS pada output JSON, dan format Rupiah (Rp) pada teks Markdown.
4. Kamu WAJIB memberikan 2 bagian output: Ringkasan Teks (Markdown) dan Data Terstruktur (JSON Code Block).

--- FORMAT OUTPUT TEKS (UNTUK USER) ---

1. IDENTIFIKASI BARANG
- Nama/Model: [Nama produk]
- Range Harga Mulus Pasar: Rp [Min] – Rp [Max]

2. RINCIAN POTONGAN NILAI
- [Nama minus 1]: - Rp [Nominal]
- [Nama minus 2]: - Rp [Nominal]
- Total Potongan: - Rp [Total]

3. REKOMENDASI HARGA JUAL
- Harga Cepat Laku: Rp [Nominal] — cocok jika butuh dana cepat
- Harga Ideal (Rekomendasi): Rp [Nominal] — seimbang antara margin dan kecepatan jual
- Harga Buka Iklan (Nego): Rp [Nominal] — pasang tinggi, beri ruang negosiasi

4. REKOMENDASI TINDAKAN
- Status: [SELL_AS_IS / REPAIR_FIRST]
- Catatan: [1-2 kalimat alasan singkat]

--- FORMAT OUTPUT JSON (UNTUK SYSTEM PARSER) ---
Di bagian paling bawah, selalu sertakan JSON block dengan tag \`\`\`json ... \`\`\` dan struktur atribut berikut:

\`\`\`json
{
  "context_id": {
    "item_name": "string",
    "market_normal_min": number,
    "market_normal_max": number,
    "deductions": [
      { "issue": "string", "deduction_amount": number }
    ],
    "total_deduction": number,
    "price_tiers": {
      "quick_sale_price": number,
      "ideal_fair_price": number,
      "max_listing_price": number
    },
    "recommendation_action": "SELL_AS_IS",
    "notes": "string"
  }
}
\`\`\``;

    const result = await runFlow(FLOWS.REKOMENDASI_HARGA, systemPrompt);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[penilai-harga]', err.message);
    res.status(500).json({ error: 'Gagal menghubungi AI. Pastikan Langflow aktif.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// B. PEMASARAN
// ══════════════════════════════════════════════════════════════════════════════

// ─── B1. Estimasi Ongkir (Konsultasi Ongkir) ─────────────────────────────────
router.post('/estimasi-ongkir', async (req, res) => {
  try {
    const { origin, destination, weight, productName } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'Kota Asal dan Kota Tujuan wajib diisi.' });
    }

    const detail_pengiriman = buildPrompt({
      'Nama Produk'    : productName || 'Barang bekas/elektronik',
      'Kota Asal'      : origin,
      'Kota Tujuan'    : destination,
      'Berat Estimasi' : weight ? `${weight} kg` : 'Estimasikan sendiri'
    });

    const systemPrompt =
`Kamu adalah Konsultan Logistik & Ongkos Kirim untuk reseller barang bekas di Indonesia. Tugasmu adalah menghitung biaya pengiriman optimal berdasarkan rute dan berat barang.

Informasi Pengiriman:
${detail_pengiriman}

Aturan Output:
1. Hindari kata pembuka/penutup basa-basi.
2. Gunakan bahasa yang lugas dan profesional.
3. Semua nominal menggunakan angka murni (tanpa Rp/titik/koma) KHUSUS pada output JSON, dan format Rupiah (Rp) pada teks Markdown.
4. Kamu WAJIB memberikan 2 bagian output: Ringkasan Teks (Markdown) dan Data Terstruktur (JSON Code Block).

--- FORMAT OUTPUT TEKS (UNTUK USER) ---

### 1. RUTE & JARAK TEMPUH (GOOGLE MAPS)
- Estimasi Jarak Tempuh: [X] km
- Estimasi Waktu Tempuh: [X] jam / menit
- Kategori Pengiriman: [Dalam Kota / Luar Kota / Antar Provinsi]

### 2. SKEMA A: PENGIRIMAN MANDIRI (KURIR PRIBADI)
- Biaya BBM: Rp [Nominal]
- Operasional & Uang Lelah: Rp [Nominal]
- Total Ongkir Mandiri: Rp [Nominal]

### 3. SKEMA B: ESTIMASI EKSPEDISI / KURIR
- Instant / Sameday: [Tersedia / Tidak tersedia] — Rp [Nominal] jika ada
- Reguler (JNE/J&T/SiCepat): Rp [Nominal] ([X] hari)
- Express / Overnight: Rp [Nominal] ([X] hari)

### 4. REKOMENDASI TERBAIK
- Opsi Terpilih: [Nama metode]
- Alasan Ringkas: [1-2 kalimat]

--- FORMAT OUTPUT JSON (UNTUK SYSTEM PARSER) ---
Di bagian paling bawah, selalu sertakan JSON block dengan tag \`\`\`json ... \`\`\` dan struktur berikut:

\`\`\`json
{
  "shipping_context_id": {
    "origin_address": "string",
    "destination_address": "string",
    "item_weight_kg": number,
    "is_intracity": false,
    "route_metrics": {
      "distance_km": number,
      "duration_minutes": number,
      "traffic_condition": "MODERATE"
    },
    "self_delivery": {
      "fuel_cost": number,
      "operational_cost": number,
      "total_recommended_fee": number
    },
    "courier_options": [
      { "service_type": "REGULAR", "provider": "string", "estimated_cost": number, "estimated_etd": "string" }
    ],
    "best_recommendation": {
      "method": "REGULAR",
      "reason": "string"
    }
  }
}
\`\`\``;

    const result = await runFlow(FLOWS.KONSULTASI_ONGKIR, systemPrompt);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[estimasi-ongkir]', err.message);
    res.status(500).json({ error: 'Gagal menghubungi AI. Pastikan Langflow aktif.' });
  }
});

// ─── B2. Analisis Harga Pasar (Perbandingan Marketplace) ─────────────────────
router.post('/analisis-pasar', async (req, res) => {
  try {
    const { productName, specs, condition, currentPrice, region } = req.body;
    if (!productName) {
      return res.status(400).json({ error: 'Nama Produk wajib diisi.' });
    }

    const detail = buildPrompt({
      'Nama Produk' : productName,
      'Spesifikasi' : specs        || '-',
      'Kondisi'     : condition    || 'Normal bekas',
      'Harga Saya'  : currentPrice ? `Rp ${Number(currentPrice).toLocaleString('id-ID')}` : 'Belum ditentukan',
      'Wilayah'     : region       || 'Indonesia'
    });

    const systemPrompt =
`Kamu adalah Market Intelligence Analyst untuk reseller barang bekas di Indonesia.
Tugasmu adalah menganalisis harga pasar produk berikut dan memberikan laporan lengkap.

Informasi Produk:
${detail}

=== ATURAN FORMATTING OUTPUT (WAJIB DIIKUTI) ===
1. Tulis analisis naratif terstruktur menggunakan heading dan paragraf, BUKAN tabel markdown.
2. Gunakan **JUDUL KAPITAL** untuk judul bagian dan baris kosong antar blok.
3. Di akhir respons, sertakan satu blok JSON persis seperti format di bawah.
=== AKHIR ATURAN FORMATTING ===

Tulis analisis mencakup:
- Perbandingan harga antar platform (Tokopedia, Shopee, OLX, Facebook Marketplace)
- Variasi harga berdasarkan wilayah (Jabodetabek, Jawa, Luar Jawa)
- Tren depresiasi dan proyeksi nilai ke depan
- Benchmark kompetitor (keunggulan, kelemahan, posisi kualitas)

Di bagian paling akhir, sertakan JSON block berikut persis seperti ini:

\`\`\`json
{
  "market_intel_context_id": {
    "platform_prices": [
      { "platform": "Tokopedia",           "min_price": 0, "max_price": 0, "market_trait": "Deskripsi singkat" },
      { "platform": "Shopee",              "min_price": 0, "max_price": 0, "market_trait": "Deskripsi singkat" },
      { "platform": "OLX",                 "min_price": 0, "max_price": 0, "market_trait": "Deskripsi singkat" },
      { "platform": "Facebook Marketplace","min_price": 0, "max_price": 0, "market_trait": "Deskripsi singkat" }
    ],
    "regional_prices": [
      { "region_group": "Jabodetabek", "min_price": 0, "max_price": 0 },
      { "region_group": "Jawa",        "min_price": 0, "max_price": 0 },
      { "region_group": "Luar Jawa",   "min_price": 0, "max_price": 0 }
    ],
    "msrp_original_price": 0,
    "price_trend_history": [
      { "year": "2022", "price": 0 },
      { "year": "2023", "price": 0 },
      { "year": "2024", "price": 0 }
    ],
    "future_projection": {
      "trend_type": "declining",
      "summary": "Ringkasan proyeksi harga ke depan."
    },
    "competitor_analysis": {
      "unique_selling_points": ["Poin 1", "Poin 2"],
      "weaknesses": ["Kelemahan 1", "Kelemahan 2"],
      "quality_position": "average"
    }
  }
}
\`\`\`

Ganti semua nilai 0 dan placeholder dengan data riil berdasarkan pengetahuanmu tentang pasar ${productName} di Indonesia.`;

    const result = await runFlow(FLOWS.PERBANDINGAN_MARKETPLACE, systemPrompt);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[analisis-pasar]', err.message);
    res.status(500).json({ error: 'Gagal menghubungi AI. Pastikan Langflow aktif.' });
  }
});

// ─── B3. Caption Posting (Deskripsi Caption) ─────────────────────────────────
router.post('/caption-posting', async (req, res) => {
  try {
    const { productName, specs, condition, price, platform, sellingPoints } = req.body;
    if (!productName) {
      return res.status(400).json({ error: 'Nama Produk wajib diisi.' });
    }

    const detail = buildPrompt({
      'Nama Produk'                : productName,
      'Spesifikasi'                : specs        || '-',
      'Kondisi'                    : condition    || 'Normal bekas',
      'Harga Jual'                 : price ? `Rp ${Number(price).toLocaleString('id-ID')}` : 'Belum ditentukan',
      'Platform Target'            : platform     || 'Facebook Marketplace, Instagram',
      'Keunggulan / Selling Points': sellingPoints || '-'
    });

    const systemPrompt =
`Kamu adalah Copywriter & Marketing Expert untuk reseller barang bekas di Indonesia.
Tugasmu adalah membuat 3 variasi caption/deskripsi produk yang siap diposting, masing-masing dioptimalkan untuk kanal berbeda.

Informasi Produk:
${detail}

=== ATURAN FORMATTING OUTPUT (WAJIB DIIKUTI) ===
1. DILARANG gunakan header markdown (### atau ##). Gunakan **JUDUL KAPITAL** untuk judul bagian.
2. DILARANG gunakan tanda bintang tunggal (* item). Gunakan strip murni (- item) untuk poin.
3. Gunakan baris kosong (double newline) antara setiap blok.
4. Gunakan --- sebagai pemisah antar opsi.
=== AKHIR ATURAN FORMATTING ===

Buat 3 opsi caption berurutan:

**OPSI 1 — QUICK SELL (WhatsApp / COD Langsung)**
Caption singkat, to-the-point, cocok untuk chat langsung atau status WA.
Sertakan harga, kondisi, dan CTA langsung (hubungi/COD).

---

**OPSI 2 — SOCIAL MEDIA (Instagram / Facebook)**
Caption engaging dengan emoji secukupnya, storytelling singkat, dan hashtag relevan (5–8 tag).
Fokus pada visual value dan keunggulan produk.

---

**OPSI 3 — E-COMMERCE (Tokopedia / Shopee)**
Deskripsi listing lengkap: spesifikasi terstruktur, kondisi detail, garansi/kelengkapan, dan FAQ singkat.
Cocok untuk copy-paste ke kolom deskripsi marketplace.

---

Di bagian paling akhir, sertakan JSON block berikut persis seperti ini:

\`\`\`json
{
  "caption_context_id": {
    "product_name": "${productName}",
    "options": [
      {
        "option_id": "OPTION_1_QUICK",
        "label": "Quick Sell",
        "channel": "WhatsApp / COD",
        "caption_text": "ISIAN_OPSI_1",
        "supported_automation": false,
        "automation_meta": null
      },
      {
        "option_id": "OPTION_2_SOCMED",
        "label": "Social Media",
        "channel": "Instagram / Facebook",
        "caption_text": "ISIAN_OPSI_2",
        "supported_automation": true,
        "automation_meta": {
          "target_flow": "flow_auto_post_instagram",
          "payload": {
            "caption": "ISIAN_OPSI_2",
            "hashtags": ["tag1","tag2"],
            "product_name": "${productName}",
            "price": "${price || ''}"
          }
        }
      },
      {
        "option_id": "OPTION_3_ECOMMERCE",
        "label": "E-Commerce",
        "channel": "Tokopedia / Shopee",
        "caption_text": "ISIAN_OPSI_3",
        "supported_automation": false,
        "automation_meta": null
      }
    ]
  }
}
\`\`\`

Ganti ISIAN_OPSI_1, ISIAN_OPSI_2, ISIAN_OPSI_3 dengan caption yang sudah kamu tulis di atas (dalam format string JSON yang valid — escape tanda kutip dan newline).`;

    const result = await runFlow(FLOWS.DESKRIPSI_CAPTION, systemPrompt);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[caption-posting]', err.message);
    res.status(500).json({ error: 'Gagal menghubungi AI. Pastikan Langflow aktif.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// D. AI AGENT
// ══════════════════════════════════════════════════════════════════════════════

// ─── AI Agent (Konsultan ReSell) ──────────────────────────────────────────────
router.post('/ai-agent', async (req, res) => {
  try {
    const { message, image_base64 } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Tulis pertanyaan atau deskripsi terlebih dahulu.' });
    }

    const imageNote = image_base64
      ? `\n[User melampirkan foto barang. Analisis visual objek, identifikasi nama/model, dan deteksi cacat yang terlihat.]`
      : '';

    const systemPrompt =
`Kamu adalah AI Konsultan ReSell — multi-tool agent untuk reseller barang bekas & refurbished di Indonesia.
Kamu punya akses ke tools berikut dan WAJIB memilih mana yang relevan berdasarkan pertanyaan user:
- tool_penilai_harga_jual        → menilai harga jual optimal berdasarkan kondisi & cacat
- tool_konsultasi_pembelian      → evaluasi kelayakan beli & potensi profit flipping
- tool_analisis_pasar            → riset harga di berbagai marketplace
- tool_estimasi_ongkir           → estimasi biaya pengiriman

=== ATURAN FORMATTING OUTPUT (WAJIB DIIKUTI) ===

1. DILARANG GUNAKAN HEADER MARKDOWN (### atau ##).
   Gunakan teks tebal kapital untuk judul bagian: **1. JUDUL BAGIAN**

2. DILARANG gunakan tanda bintang tunggal untuk bullet (* item).
   Gunakan tanda strip murni: - item

3. WAJIB gunakan double newline (baris kosong) antara setiap blok/paragraf.

4. Gunakan --- (tiga strip) sebagai pemisah antar bagian.

5. Contoh format yang BENAR:
**RINGKASAN PRODUK**
Nama produk dan kondisi singkat.

---

**1. ESTIMASI HARGA JUAL**

- Kondisi A: Rp X - Rp Y

- Kondisi B: Rp X - Rp Y

---

**2. STRATEGI PEMASARAN**

- Poin aksi pertama.

- Poin aksi kedua.

---

**3. DATA YANG DIBUTUHKAN**

- Item data 1.

- Item data 2.

=== AKHIR ATURAN FORMATTING ===

Aturan konten:
1. Jawab ringkas, actionable, dalam Bahasa Indonesia.
2. Hindari basa-basi pembuka/penutup.
3. Jika foto dilampirkan: identifikasi barang, nama/model, dan cacat visual yang terlihat.
4. Di bagian paling akhir, WAJIB sertakan JSON block berikut (isi hanya node yang relevan, sisanya boleh dihilangkan):

\`\`\`json
{
  "active_tools": ["tool_penilai_harga_jual"],
  "scanned_item": {
    "is_valid_object": true,
    "is_sellable": true,
    "identified_item": "Nama/Model Barang",
    "detected_visual_defects": ["Cacat 1", "Cacat 2"]
  },
  "valuation_context_id": {
    "item_name": "string",
    "deductions": [
      { "issue": "string", "deduction_amount": number }
    ],
    "total_deduction": number,
    "price_tiers": {
      "quick_sale_price": number,
      "ideal_fair_price": number,
      "max_listing_price": number
    }
  },
  "purchasing_context_id": {
    "item_name": "string",
    "asking_price": number,
    "repair_cost": number,
    "total_cost": number,
    "market_price": number,
    "estimated_profit": number,
    "roi_percentage": number,
    "decision_status": "RECOMMENDED",
    "target_nego_price": number,
    "target_roi_after_nego": number,
    "nego_reasoning": ["string"]
  }
}
\`\`\`

Pertanyaan user:
${message.trim()}${imageNote}`;

    const result = await runFlow(FLOWS.KONSULTAN_RESELL, systemPrompt);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[ai-agent]', err.message);
    res.status(500).json({ error: 'Gagal menghubungi AI. Pastikan Langflow aktif.' });
  }
});

// ─── Foto Editor: validasi foto produk ───────────────────────────────────────
router.post('/foto-editor/validate', async (req, res) => {
  if (photoFlowUnavailable(res, FLOWS.FOTO_VALIDATOR)) return;
  const image = validatePhotoDataUrl(req.body?.image_base64);
  if (!image) {
    return res.status(400).json({ error: 'Foto tidak valid. Gunakan JPG, PNG, atau WEBP maksimal 7 MB.' });
  }

  try {
    // Kirim sebagai JSON dengan kunci image_base64 agar flow Validator Foto dapat membacanya
    const inputJson = JSON.stringify({ image_base64: image.dataUrl });
    const result = await runFlow(FLOWS.FOTO_VALIDATOR, inputJson);
    const raw = parsePhotoFlowJson(result);
    const validation = normalizedValidatorResult(raw);
    res.json({ success: true, validation });
  } catch (err) {
    console.error('[foto-editor:validate]', err.message);
    res.status(502).json({ error: 'Validasi foto gagal. Periksa koneksi Langflow dan format JSON output flow Validator Foto.' });
  }
});

// ─── Foto Editor: hapus background via remove.bg ─────────────────────────────
router.post('/foto-editor/remove-bg', async (req, res) => {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey || apiKey === 'your_remove_bg_api_key_here') {
    return res.status(503).json({ error: 'REMOVE_BG_API_KEY belum diisi di config.env.' });
  }

  const image = validatePhotoDataUrl(req.body?.image_base64);
  if (!image) {
    return res.status(400).json({ error: 'Foto tidak valid. Gunakan JPG, PNG, atau WEBP maksimal 7 MB.' });
  }

  try {
    const form = new FormData();
    form.append('image_file_b64', image.bytes.toString('base64'));
    form.append('size', 'auto');
    form.append('format', 'png');

    const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
      headers: { ...form.getHeaders(), 'X-Api-Key': apiKey },
      responseType: 'arraybuffer',
      timeout: 60000
    });

    const resultBytes = Buffer.from(response.data);
    const resultB64   = resultBytes.toString('base64');
    res.json({ success: true, image_base64: `data:image/png;base64,${resultB64}` });
  } catch (err) {
    const detail = err.response?.data
      ? Buffer.from(err.response.data).toString('utf8')
      : err.message;
    console.error('[foto-editor:remove-bg]', detail);
    res.status(502).json({ error: `Hapus background gagal: ${detail}` });
  }
});

// ─── Foto Editor: Studio Foto Editor — compositing dengan context ID ─────────
router.post('/foto-editor/process', async (req, res) => {
  if (photoFlowUnavailable(res, FLOWS.FOTO_EDITOR)) return;

  const { background, background_color: color, lighting, shadow, temperature,
          item_photo_context_id, background_photo_context_id, background_image_base64 } = req.body || {};

  // Validasi foto barang (menggunakan item_photo_context_id yang dikirim dari validator)
  const image = validatePhotoDataUrl(req.body?.image_base64);
  if (!image) {
    return res.status(400).json({ error: 'Foto barang tidak valid. Unggah ulang foto JPG, PNG, atau WEBP maksimal 7 MB.' });
  }

  if (!Object.prototype.hasOwnProperty.call(PHOTO_BACKGROUNDS, background)) {
    return res.status(400).json({ error: 'Pilih preset latar belakang yang tersedia.' });
  }
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
    return res.status(400).json({ error: 'Warna latar tidak valid.' });
  }
  const adjustment = (value, min, max) => Number.isFinite(Number(value))
    && Number(value) >= min && Number(value) <= max;
  if (!adjustment(lighting, 70, 140) || !adjustment(shadow, 0, 100)
      || !adjustment(temperature, -50, 50)) {
    return res.status(400).json({ error: 'Nilai pencahayaan, bayangan, atau temperatur di luar rentang.' });
  }

  // Validasi foto latar kustom jika mode custom-image
  let bgImage = null;
  if (background === 'custom-image') {
    bgImage = validatePhotoDataUrl(background_image_base64);
    if (!bgImage) {
      return res.status(400).json({ error: 'Foto latar tidak valid. Unggah ulang foto JPG, PNG, atau WEBP maksimal 7 MB.' });
    }
  }

  // Hitung parameter compositing dari slider
  const lightVal    = Number(lighting);
  const shadowVal   = Number(shadow);
  const tempVal     = Number(temperature);
  const brightness  = Math.round((lightVal - 100) * 0.1);          // -3 .. +4
  const contrast    = Math.round((lightVal - 100) * -0.1);         // slight inverse
  const saturation  = Math.round(lightVal / 10 - 10);              // scaled
  const exposure    = parseFloat(((lightVal - 100) / 100).toFixed(2));
  const shadowOpacity = parseFloat((shadowVal / 100).toFixed(2));
  const shadowDist  = Math.round(shadowVal * 0.25);
  const shadowBlur  = Math.round(10 + shadowVal * 0.2);
  const lightAngle  = tempVal >= 0 ? 45 : 135;
  const lightIntensity = lightVal >= 120 ? 'HIGH' : lightVal >= 90 ? 'MEDIUM' : 'LOW';
  const colorTemp   = tempVal > 10 ? 'WARM' : tempVal < -10 ? 'COOL' : 'NEUTRAL';
  const cssFilter   = `brightness(${lightVal}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%) hue-rotate(0deg)`;

  const compositingContext = {
    source_inputs: {
      item_id: item_photo_context_id || 'item',
      background_id: background_photo_context_id || background
    },
    lighting_analysis: {
      light_source_angle_degrees: lightAngle,
      light_intensity: lightIntensity,
      color_temperature: colorTemp
    },
    image_adjustments: {
      brightness,
      contrast,
      saturation,
      hue_shift_degrees: 0,
      color_temperature_shift: tempVal,
      exposure
    },
    drop_shadow_params: {
      enable_shadow: shadowVal > 0,
      shadow_angle_degrees: 135,
      shadow_distance_px: shadowDist,
      shadow_blur_px: shadowBlur,
      shadow_opacity: shadowOpacity,
      shadow_color_hex: '#1A1A24'
    },
    css_filter_string: cssFilter
  };

  try {
    // Flow Studio Foto Editor menggunakan template variable:
    // {item_photo_context_id} dan {background_photo_context_id}
    // Kirim sebagai JSON di input_value DAN via tweaks untuk memastikan
    // variabel dapat dibaca baik lewat ChatInput maupun GlobalVariables
    const itemCtx = {
      context_id: item_photo_context_id || 'item',
      mime_type: image.mimeType,
      image_base64: image.dataUrl
    };
    const bgCtx = bgImage
      ? { context_id: background_photo_context_id || `bg_${Date.now()}`, mime_type: bgImage.mimeType, image_base64: bgImage.dataUrl }
      : { context_id: background_photo_context_id || `bg_${background}`, preset: background, description: PHOTO_BACKGROUNDS[background], color_hex: color };

    const flowPayload = JSON.stringify({
      item_photo_context_id: itemCtx,
      background_photo_context_id: bgCtx
    });

    const result = await runFlow(FLOWS.FOTO_EDITOR, flowPayload);
    const output = parsePhotoFlowJson(result);

    const imageDataUrl = normalizeEditedImage(output.image_data_url || output.image_base64);
    if (!imageDataUrl) {
      throw new Error('Flow Studio Foto Editor tidak mengembalikan image_base64 atau image_data_url yang valid.');
    }

    // Kembalikan compositing_context_id dari flow jika ada, fallback ke yang kita hitung
    const returnedContext = output.compositing_context_id && typeof output.compositing_context_id === 'object'
      ? output.compositing_context_id
      : compositingContext;

    res.json({
      success: true,
      image_data_url: imageDataUrl,
      compositing_context_id: returnedContext
    });
  } catch (err) {
    console.error('[foto-editor:process]', err.message);
    res.status(502).json({ error: 'Pemrosesan Studio Foto gagal. Periksa flow Studio Foto Editor dan format output gambarnya.' });
  }
});

// ─── igGenerateCaption masih menggunakan /caption-posting ────────────────────
// Alias agar igGenerateCaption() di frontend tetap berjalan
router.post('/marketing', async (req, res) => {
  req.url = '/caption-posting';
  router.handle(req, res, () => {});
});

module.exports = router;
