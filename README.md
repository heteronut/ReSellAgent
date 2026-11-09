<div align="center">

# ReSell AI

Ruang kerja untuk reseller Indonesia: periksa barang, tentukan harga, siapkan listing, dan kelola pesan Instagram.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Langflow](https://img.shields.io/badge/Langflow-AI%20Flows-blueviolet)](https://langflow.org)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

</div>

---

## Alat

| Alat | Kegunaan |
|---|---|
| **Cek kelayakan beli** | Tinjau harga beli, kondisi, dan biaya perbaikan |
| **Tentukan harga jual** | Perkirakan harga jual dari data barang |
| **Bandingkan harga** | Lihat kisaran harga di marketplace |
| **Hitung ongkir** | Taksir biaya pengiriman dari berat dan kota |
| **Buat caption** | Susun deskripsi dan materi listing |
| **Edit foto produk** | Ganti latar dan sesuaikan tampilan foto |
| **Pesan Instagram** | Tinjau pesan dan draf balasan sebelum mengirim |
| **Post ke Instagram** | Siapkan konten dan publikasikan melalui Composio |

---

## Arsitektur

```
ReSellAgent/
├── frontend/
│   ├── index.html              # Single-page app (Vanilla JS)
│   ├── assets/css/main.css     # Tema terang dan gelap
│   └── assets/js/main.js       # Semua logika klien
│
└── backend/
    ├── server.js               # Express server (port 3000)
    ├── config.env              # Konfigurasi environment (lokal)
    ├── config.env.example      # Template konfigurasi
    ├── middleware/
    │   └── langflow.js         # Proxy & helper ke Langflow
    └── routes/
        ├── flows.js            # AI flow endpoints
        ├── instagram.js        # Instagram post via Composio
        ├── instagram-meta.js   # Instagram OAuth via Meta API
        ├── inbox.js            # DM inbox & reply
        └── google-drive.js     # Google Drive integration
```

**Stack:** Static HTML/CSS/JS (Vanilla) · Express.js · OpenAI-compatible AI API / Langflow · Composio · Meta Graph API

---

## Instalasi dan konfigurasi

### 1. Clone & Install

```bash
git clone https://github.com/heteronut/ReSellAgent.git
cd ReSellAgent/backend
npm install
```

### 2. Konfigurasi Environment

```bash
cp config.env.example config.env
```

Edit `backend/config.env`:

```env
# ── OpenAI-compatible AI API (opsional; diprioritaskan jika diisi) ─
AI_API_BASE_URL=http://localhost:20128/v1
AI_API_KEY=your_api_key
AI_MODEL=kr/auto

# ── Langflow (fallback; tetap diperlukan untuk Foto Editor AI) ─────
LANGFLOW_SERVER_URL=http://127.0.0.1:7860
LANGFLOW_API_KEY=your_langflow_api_key

# ── Flow IDs (salin dari Langflow dashboard) ────────────
FLOW_KONSULTAN_RESELL=
FLOW_REKOMENDASI_HARGA=
FLOW_DESKRIPSI_CAPTION=
FLOW_PERBANDINGAN_HARGA_BELI_JUAL=
FLOW_PERBANDINGAN_MARKETPLACE=
FLOW_KONSULTASI_ONGKIR=
FLOW_FOTO_VALIDATOR=
FLOW_FOTO_EDITOR=
FLOW_INBOX_REPLY_DRAFT=

# ── Remove.bg (opsional, untuk hapus background) ────────
REMOVE_BG_API_KEY=

# ── Composio (Instagram via Composio) ───────────────────
COMPOSIO_API_KEY=
COMPOSIO_AUTH_CONFIG_ID=

# ── Meta API (Instagram OAuth langsung) ─────────────────
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3000/api/instagram/meta/callback

PORT=3000
```

### 3. Jalankan Server

```bash
# Windows
start-server.bat

# Atau langsung
cd backend && node server.js
```

Buka **http://localhost:3000** di browser.

---

## Konfigurasi AI

Fitur teks menggunakan endpoint OpenAI-compatible jika `AI_API_BASE_URL` dan `AI_API_KEY` diisi. Default model adalah `kr/auto`; ubah `AI_MODEL` sesuai model yang tersedia pada gateway. API key hanya disimpan di `backend/config.env` dan tidak dikirim ke frontend.

Jika endpoint AI tidak dikonfigurasi, fitur teks menggunakan Langflow. Foto Editor AI tetap membutuhkan flow Langflow `FLOW_FOTO_VALIDATOR` dan `FLOW_FOTO_EDITOR`.

### Konfigurasi Langflow Flows

Foto Editor AI membutuhkan flow Langflow berikut. Kontrak input/output:

### Flow: `FLOW_FOTO_VALIDATOR`
- **Input:** JSON `{ "image_mime_type": "image/jpeg", "image_base64": "..." }`
- **Output:** JSON `{ "is_valid_object": true, "is_sellable": true, "identified_item": "Kamera", "reason": "..." }`
- Foto hanya lolos jika kedua nilai `true`.

### Flow: `FLOW_FOTO_EDITOR`
- **Input:** `image_base64`, preset latar, kode warna, nilai `lighting`, `shadow`, `temperature`
- **Output:** JSON `{ "image_base64": "..." }` atau `{ "image_data_url": "..." }`
- Preset tersedia: studio krem, studio abu sejuk, putih marketplace, interior lifestyle hangat.

### Flow: `FLOW_INBOX_REPLY_DRAFT`
- **Input:** Beberapa pesan terakhir dalam percakapan (sebagai konteks)
- **Output:** Teks balasan biasa (plain text) yang siap diedit sebelum dikirim.

---

## Pesan Instagram

- Menggunakan akun Instagram yang sudah terhubung di menu **Post IG** - tidak perlu OAuth ulang.
- Akun harus bertipe **Instagram Business/Creator** dengan izin pesan aktif di koneksi Meta.
- Percakapan diperbarui otomatis setiap **60 detik**.
- Meta hanya mengizinkan balasan API dalam **24 jam** setelah pesan/interaksi pelanggan.
- Tombol **Kirim** dinonaktifkan otomatis jika jendela 24 jam sudah lewat.
- **Draf AI** menggunakan OpenAI-compatible AI API jika dikonfigurasi; jika tidak, atur `FLOW_INBOX_REPLY_DRAFT` di Langflow. Draf tetap bisa diedit sebelum dikirim.

> **Facebook Messenger & WhatsApp** belum diaktifkan di Inbox untuk saat ini.

---

## Endpoint API

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/health` | Status server & flow yang terkonfigurasi |
| `POST` | `/api/flows/:flowId` | Proxy request ke Langflow flow |
| `POST` | `/api/instagram/post` | Post produk ke Instagram via Composio |
| `GET` | `/api/instagram/meta/callback` | Callback OAuth Meta |
| `GET` | `/api/inbox/conversations` | Ambil daftar percakapan DM |
| `POST` | `/api/inbox/reply` | Kirim balasan DM |

**Rate limit:** 30 request/menit per IP.

---

## Pemeriksaan server

```bash
curl http://localhost:3000/api/health
```

```json
{
  "status": "ok",
  "langflow_url": "http://127.0.0.1:7860",
  "instagram_configured": true,
  "instagram_meta_configured": true,
  "flows": {
    "konsultan_resell": "abc-123",
    "rekomendasi_harga": "def-456"
  }
}
```

---

## Keamanan

- `backend/config.env` **tidak di-commit** ke repository (sudah di `.gitignore`).
- Salin `config.env.example` menjadi `config.env`, lalu isi dengan key milik sendiri.
- API key Composio & Meta App Secret **jangan pernah** di-expose ke frontend.
- Jika API key ter-leak, segera **regenerate** dari dashboard masing-masing platform.

---

## Rencana pengembangan

- [ ] WhatsApp & Facebook Messenger di Inbox
- [ ] Integrasi Tokopedia & Shopee API untuk sinkronisasi listing
- [ ] Multi-profil dengan auth user sederhana
- [ ] Scheduled posting (queue otomatis)
- [ ] Export laporan profit ke PDF/Excel

---

## Lisensi

MIT License. Copyright 2025 [heteronut](https://github.com/heteronut).