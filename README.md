<div align="center">

# ?? ReSell AI Agent

**Platform AI untuk reseller Indonesia — analisis harga, generate konten, dan posting ke Instagram otomatis.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Langflow](https://img.shields.io/badge/Langflow-AI%20Flows-blueviolet)](https://langflow.org)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

</div>

---

## ? Fitur Utama

| Fitur | Deskripsi |
|---|---|
| ?? **Analisis Harga** | Riset harga pasar & rekomendasi harga jual optimal |
| ?? **Kalkulator Profit** | Hitung margin, keuntungan, dan break-even secara real-time |
| ?? **Generate Deskripsi** | Caption & deskripsi produk siap-posting berbahasa Indonesia |
| ?? **Perbandingan Marketplace** | Bandingkan harga di Tokopedia, Shopee, Facebook Marketplace, OLX |
| ?? **Estimasi Ongkir** | Konsultasi biaya pengiriman berdasarkan berat & kota tujuan |
| ?? **Foto Editor AI** | Hapus background & edit foto produk otomatis dengan AI |
| ?? **Inbox Pesan** | Balas DM Instagram langsung dari dashboard + draf AI |
| ?? **Auto-Post Instagram** | Posting produk ke Instagram Business via Composio OAuth |

---

## ??? Arsitektur

```
ReSellAgent/
+-- frontend/
¦   +-- index.html              # Single-page app (Vanilla JS)
¦   +-- assets/css/main.css     # Dark navy + amber/cyan theme
¦   +-- assets/js/main.js       # Semua logika klien
¦
+-- backend/
    +-- server.js               # Express server (port 3000)
    +-- config.env              # Konfigurasi environment (lokal)
    +-- config.env.example      # Template konfigurasi
    +-- middleware/
    ¦   +-- langflow.js         # Proxy & helper ke Langflow
    +-- routes/
        +-- flows.js            # AI flow endpoints
        +-- instagram.js        # Instagram post via Composio
        +-- instagram-meta.js   # Instagram OAuth via Meta API
        +-- inbox.js            # DM inbox & reply
        +-- google-drive.js     # Google Drive integration
```

**Stack:** Static HTML/CSS/JS (Vanilla) · Express.js · Langflow · Composio · Meta Graph API

---

## ?? Instalasi & Setup

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
# -- Langflow --------------------------------------------
LANGFLOW_SERVER_URL=http://127.0.0.1:7860
LANGFLOW_API_KEY=your_langflow_api_key

# -- Flow IDs (salin dari Langflow dashboard) ------------
FLOW_KONSULTAN_RESELL=
FLOW_REKOMENDASI_HARGA=
FLOW_DESKRIPSI_CAPTION=
FLOW_PERBANDINGAN_HARGA_BELI_JUAL=
FLOW_PERBANDINGAN_MARKETPLACE=
FLOW_KONSULTASI_ONGKIR=
FLOW_FOTO_VALIDATOR=
FLOW_FOTO_EDITOR=
FLOW_INBOX_REPLY_DRAFT=

# -- Remove.bg (opsional, untuk hapus background) --------
REMOVE_BG_API_KEY=

# -- Composio (Instagram via Composio) -------------------
COMPOSIO_API_KEY=
COMPOSIO_AUTH_CONFIG_ID=

# -- Meta API (Instagram OAuth langsung) -----------------
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

## ?? Konfigurasi Langflow Flows

Setiap fitur AI membutuhkan satu flow di Langflow. Berikut kontrak input/output masing-masing:

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

## ?? Inbox Pesan Instagram

- Menggunakan akun Instagram yang sudah terhubung di menu **Post IG** — tidak perlu OAuth ulang.
- Akun harus bertipe **Instagram Business/Creator** dengan izin pesan aktif di koneksi Meta.
- Percakapan diperbarui otomatis setiap **60 detik**.
- Meta hanya mengizinkan balasan API dalam **24 jam** setelah pesan/interaksi pelanggan.
- Tombol **Kirim** dinonaktifkan otomatis jika jendela 24 jam sudah lewat.
- **Draf AI** membutuhkan `FLOW_INBOX_REPLY_DRAFT` — draf tetap bisa diedit sebelum dikirim.

> **Facebook Messenger & WhatsApp** belum diaktifkan di Inbox untuk saat ini.

---

## ?? API Endpoints

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

## ?? Health Check

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
    "rekomendasi_harga": "def-456",
    ...
  }
}
```

---

## ??? Keamanan

- `backend/config.env` **tidak di-commit** ke repository (sudah di `.gitignore`).
- Salin `config.env.example` ? `config.env` dan isi dengan key milik sendiri.
- API key Composio & Meta App Secret **jangan pernah** di-expose ke frontend.
- Jika API key ter-leak, segera **regenerate** dari dashboard masing-masing platform.

---

## ??? Roadmap

- [ ] WhatsApp & Facebook Messenger di Inbox
- [ ] Integrasi Tokopedia & Shopee API untuk sinkronisasi listing
- [ ] Multi-profil dengan auth user sederhana
- [ ] Scheduled posting (queue otomatis)
- [ ] Export laporan profit ke PDF/Excel

---

## ?? Lisensi

MIT © 2025 [heteronut](https://github.com/heteronut)
