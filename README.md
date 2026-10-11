# ReSellAgent

## Inbox Pesan

Inbox saat ini hanya memakai akun Instagram yang sudah terhubung pada profil aktif di menu **Post IG**; tidak perlu melakukan OAuth Instagram lagi dari Inbox. Akun harus Instagram Business/Creator dan izin pesan harus tersedia pada koneksi Meta.

Percakapan disegarkan otomatis setiap 60 detik selama halaman Inbox terbuka. Balasan memakai ID pengirim dari pesan masuk terbaru pada percakapan tersebut. Pengguna harus memulai percakapan; Meta hanya mengizinkan balasan API dalam 24 jam setelah pesan/interaksi pelanggan yang memenuhi syarat. Inbox menonaktifkan tombol kirim jika waktu pesan masuk menunjukkan jendela tersebut sudah lewat; minta pelanggan mengirim DM baru agar dapat membalas. Jika Meta tetap menolak DM yang baru diterima, segarkan percakapan dan periksa izin/koneksi Meta atau hubungi dukungan Composio dengan Meta trace ID. Tombol **Buat draf AI** membutuhkan flow Langflow `FLOW_INBOX_REPLY_DRAFT` di `backend/config.env`. Flow menerima konteks beberapa pesan terakhir dan harus mengembalikan teks balasan biasa. Draf tetap dapat diedit dan tidak dikirim sebelum pengguna menekan **Kirim balasan**.

Facebook Messenger dan WhatsApp belum diaktifkan di Inbox untuk saat ini.

## Foto Editor

Fitur Foto Editor memakai dua flow Langflow yang harus dikonfigurasi di `backend/config.env`:

- `FLOW_FOTO_VALIDATOR`: flow Gemini menerima input chat JSON berisi `image_mime_type` dan `image_base64`. Kembalikan JSON saja, misalnya `{"is_valid_object":true,"is_sellable":true,"identified_item":"Kamera","reason":"Objek terlihat jelas"}`. Foto hanya lolos jika kedua nilai kelayakan bernilai `true`.
- `FLOW_FOTO_EDITOR`: menerima `image_base64`, preset dan deskripsi latar, kode warna, serta nilai `lighting`, `shadow`, dan `temperature`. Preset mencakup studio krem, studio abu sejuk, putih marketplace, dan interior lifestyle hangat. Flow bertugas memisahkan objek, membuat/mengganti latar sesuai pilihan, lalu menyelaraskan cahaya dan warna. Kembalikan JSON saja dengan `image_base64` (base64 PNG/JPEG/WEBP atau data URL gambar) atau `image_data_url`.

Kedua flow menerima gambar sebagai data URL base64 melalui input teks Langflow; flow perlu mengurai JSON tersebut sebelum meneruskan gambar ke node Gemini/pengolah gambar. Hasil validasi dan pengeditan ditampilkan langsung di browser, dan gambar hasil tersedia melalui tombol **Unduh foto**. Ukuran unggahan dibatasi 7 MB.