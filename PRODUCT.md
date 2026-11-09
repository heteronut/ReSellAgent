# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS (Vanilla) - frontend served by Express.js backend on port 3000. No framework.

## Users

Reseller individu (penjual barang bekas/refurbished) di Indonesia - terutama yang aktif di Facebook Marketplace, Tokopedia, Shopee, OLX, dan Instagram. Mereka menggunakan smartphone maupun desktop untuk mengelola listing, mengecek harga, dan memposting produk.

## Product Purpose

ReSell AI adalah web app untuk membantu reseller menilai barang, menentukan harga, menyiapkan materi jualan, dan mengelola pesan Instagram. Analisis dan integrasi eksternal bergantung pada konfigurasi backend.

## Positioning

Ruang kerja berbahasa Indonesia untuk riset barang, persiapan listing, dan pengelolaan Instagram. Navigasi kategori mengikuti pola dashboard operasional yang umum, tanpa meniru identitas marketplace tertentu.

## Operating Context

- Digunakan saat memeriksa barang dan menyiapkan listing, terutama untuk laptop, ponsel, dan elektronik bekas
- Dipakai dari ponsel maupun desktop
- Integrasi Instagram via Composio OAuth (API key per-profil, tersimpan di browser)
- Backend AI flows di port 3000 (LangFlow endpoints)
- Tema terang dan gelap; pilihan tema disimpan di browser

## Capabilities and Constraints

- AI flows: product-analysis, profit-analysis, marketing, automation, market-comparison, shipping
- Instagram auto-post via Composio (butuh OAuth + API key)
- Handoff detail produk ke alat lain hanya mengisi kolom yang masih kosong
- Kalkulator profit widget (client-side)
- Margin meter widget
- Marketplace quick-check widget
- 4 Output Insight Widgets (harga, margin, platform, confidence)
- Bahasa antarmuka: Indonesia
- Tidak ada auth/login user - single-user per browser session

## Brand Commitments

Nama: **ReSell AI**. Ikon merek berupa ilustrasi garis, bukan emoji. Nada bahasa praktis, jelas, dan langsung; produk ditujukan untuk penjual mandiri.

## Evidence on Hand

- `frontend/index.html` - antarmuka lengkap
- `frontend/assets/css/main.css` - tema terang dan gelap dengan sidebar navy, aksen teal, dan amber
- `frontend/assets/js/main.js` - semua logika klien
- `backend/routes/` - flows.js dan instagram.js

## Product Principles

1. **Bantu keputusan barang** - tampilkan harga atau margin bila data dan alur mendukungnya
2. **Sambungkan pekerjaan** - detail barang dapat diteruskan ke alat terkait tanpa mengganti isian pengguna
3. **Lokal dulu** - bahasa Indonesia, konteks marketplace lokal, dan harga dalam Rupiah
4. **Simpan state di browser** - tidak perlu signup; data input dan API key tersimpan per profil lokal
5. **Nyaman di ponsel** - formulir, navigasi, dan widget tetap dapat digunakan pada layar kecil
