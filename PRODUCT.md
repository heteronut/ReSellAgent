# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS (Vanilla) — frontend served by Express.js backend on port 3000. No framework.

## Users

Reseller individu (penjual barang bekas/refurbished) di Indonesia — terutama yang aktif di Facebook Marketplace, Tokopedia, Shopee, OLX, dan Instagram. Mereka menggunakan smartphone maupun desktop untuk mengelola listing, mengecek harga, dan memposting produk.

## Product Purpose

ReSell AI Agent adalah web app yang membantu reseller memaksimalkan keuntungan dan efisiensi penjualan dengan AI. Fungsi utama: analisis harga pasar, kalkulasi profit, generate deskripsi/caption marketing, cek ongkos kirim, riset pasar multi-platform, dan auto-post ke Instagram via Composio.

## Positioning

Satu-satunya tool AI resell lokal (Bahasa Indonesia) yang menggabungkan analisis harga, marketing content generation, dan posting otomatis ke Instagram dalam satu antarmuka — tanpa perlu pengetahuan teknis.

## Operating Context

- Digunakan saat mempersiapkan listing produk baru (laptop, HP, elektronik bekas)
- Sering dipakai dari smartphone di kondisi pencahayaan ruangan biasa
- Integrasi Instagram via Composio OAuth (API key per-profil, tersimpan di browser)
- Backend AI flows di port 3000 (LangFlow endpoints)

## Capabilities and Constraints

- AI flows: product-analysis, profit-analysis, marketing, automation, market-comparison, shipping
- Instagram auto-post via Composio (butuh OAuth + API key)
- Kalkulator profit widget (client-side)
- Margin meter widget
- Marketplace quick-check widget
- 4 Output Insight Widgets (harga, margin, platform, confidence)
- Bahasa antarmuka: Indonesia
- Tidak ada auth/login user — single-user per browser session

## Brand Commitments

Nama: **ReSell AI** — emoji robot 🤖 sebagai ikon. Tone: praktis, langsung, percaya diri. Bukan enterprise — ini tool untuk penjual mandiri.

## Evidence on Hand

- `frontend/index.html` — antarmuka lengkap
- `frontend/assets/css/main.css` — dark navy + amber/cyan theme
- `frontend/assets/js/main.js` — semua logika klien
- `backend/routes/` — flows.js dan instagram.js

## Product Principles

1. **Langsung ke angka** — setiap output AI harus ada harga atau margin yang actionable
2. **Satu layar, semua tools** — tidak perlu pindah tab untuk analisis → caption → post
3. **Lokal dulu** — bahasa Indonesia, konteks marketplace lokal, harga dalam Rupiah
4. **Simpan state di browser** — tidak perlu signup; API key tersimpan per profil lokal
5. **Mobile-first dalam spirit** — panel dan widget harus tetap usable di layar kecil
