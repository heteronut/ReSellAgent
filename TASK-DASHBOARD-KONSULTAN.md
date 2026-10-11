# Task: Desain Komponen Dashboard Fungsi Konsultan Pembelian

Desain komponen dashboard fungsi konsultan pembelian untuk mengevaluasi kelayakan pembelian barang, potensi keuntungan penjualan kembali, biaya perbaikan, dan strategi negosiasi.

## 1. Identitas barang & keputusan

- Tampilkan item_name sebagai judul utama.
- Tampilkan badge decision_status:
  - RECOMMENDED → Direkomendasikan, hijau #22C55E.
  - RISKY → Berisiko, kuning #EAB308.
  - SKIP → Lewati, merah #EF4444.
- Gunakan decision_color secara konsisten dengan status.
- Tampilkan risk_level sebagai badge terpisah: Risiko Rendah, Risiko Sedang, atau Risiko Tinggi.
- Jangan mengandalkan warna saja; sertakan label dan ikon status.

## 2. Kartu ringkasan metrik

Buat empat kartu utama:

- Harga Penawaran — asking_price.
- Total Modal — total_cost.
- Estimasi Keuntungan — estimated_profit.
- ROI — roi_percentage.

Format nominal dalam rupiah dan ROI dalam persen. Bedakan keuntungan positif dan negatif dengan jelas tanpa membuat angka negatif terlihat menguntungkan.

## 3. Rincian biaya & perbandingan pasar

Buat panel "Analisis Harga & Biaya" yang memuat:

- Harga penawaran: asking_price.
- Biaya perbaikan: repair_cost.
- Total modal: total_cost.
- Harga pasar: market_price.
- Estimasi keuntungan: estimated_profit.

Tambahkan visual perbandingan total modal vs harga pasar, berupa bar horizontal yang mudah dibaca. Jika menggunakan rincian bertumpuk, bedakan harga pembelian dan biaya perbaikan. Jangan menambahkan grafik tren karena data tidak memiliki riwayat waktu.

Tampilkan indikator repair_required:

- true → Perlu Perbaikan.
- false → Tidak Perlu Perbaikan.

Tetap tampilkan biaya perbaikan sesuai data, termasuk ketika nilainya nol.

## 4. Strategi negosiasi

Buat kartu "Target Negosiasi" dengan:

- Target Harga Beli — target_nego_price, sebagai angka paling menonjol.
- Target ROI Setelah Negosiasi — target_roi_after_nego.
- Perbandingan ringkas antara harga penawaran awal dan target negosiasi.
- Daftar alasan negosiasi dari nego_reasoning, dengan satu poin untuk setiap elemen array.

Jangan mengarang alasan tambahan atau menampilkan target negosiasi seolah sudah disepakati.

## 5. Tata letak & keadaan tampilan

- Gunakan tata letak desktop yang responsif: ringkasan metrik di atas, analisis biaya dan strategi negosiasi di bawah.
- Buat contoh tampilan untuk ketiga status keputusan dengan struktur yang sama.
- Sediakan keadaan data kosong dan alasan negosiasi kosong. Nilai nol harus tetap tampil sebagai nol, bukan dianggap data hilang.
- Gunakan data yang diberikan sebagai sumber utama; jangan mengubah nilai atau menghitung ulang metrik tanpa instruksi.
