# Pemetaan Status SNI 9021:2021 dan Tingkat Peringatan SiagaLongsor

## 1. Tujuan

Dokumen ini menetapkan cara SiagaLongsor menampilkan tiga tingkat peringatan gerakan tanah pada
dashboard dan Telegram. Kondisi **Aman** ditambahkan sebagai kondisi normal di luar tiga tingkat
peringatan. Enum server yang digunakan ialah `SAFE`, `WATCH`, `WARNING`, `DANGER`, dan `UNKNOWN`.

Implementasi ini adalah **penyelarasan terminologi dan model tingkat peringatan**, bukan
sertifikasi bahwa perangkat sudah memenuhi seluruh persyaratan SNI 9021:2021.

## 2. Dasar resmi

- [Katalog BSN SNI 9021:2021](https://pesta.bsn.go.id/produk/detail/13601-sni90212021)
  mencatat judul **Peralatan peringatan dini gerakan tanah**, status berlaku, Komite Teknis 13-08,
  dan tanggal penetapan 21 Desember 2021.
- [BNPB: Penetapan SNI 9021:2021](https://bnpb.go.id/berita/penetapan-sni-90212021-peralatan-peringatan-dini-gerakan-tanah)
  menjelaskan bahwa SNI 9021:2021 melengkapi SNI 8235:2017 tentang Sistem Peringatan Dini Gerakan
  Tanah.
- [Daftar SNI Kebencanaan BNPB](https://www.bnpb.go.id/sni-kebencanaan) mencantumkan SNI
  9021:2021 dan SNI 8235:2017 sebagai dua standar yang berbeda tetapi berkaitan.
- [Contoh penerapan LEWS BNPB](https://bnpb.go.id/index.php/berita/gladi-evakuasi-longsor-warga-kalisalak)
  menyebut tiga tingkat ancaman gerakan tanah: **Waspada, Siaga, dan Awas**, serta penggunaan
  ekstensometer, tiltmeter, penakar hujan, dan sistem sirene/lampu.
- [Contoh sistem BNPB di Bandung Barat](https://bnpb.go.id/index.php/berita/tingkatkan-kapasitas-warga-bandung-barat-bnpb-gelar-geladi-peringatan-dini-)
  menekankan sensor teknis, protokol diseminasi, geladi, dan respons masyarakat sebagai satu
  kesatuan sistem.

Dokumen lengkap SNI diakses melalui layanan resmi BSN dan dapat memerlukan akun. Tim harus
menggunakan salinan resmi saat melakukan audit kepatuhan per klausul.

## 3. Keputusan kompatibilitas

Enum `WARNING` ditambahkan melalui migration aditif agar histori lama tetap valid. Enum firmware
tetap dipisahkan karena status server adalah sumber kebenaran. Presentasi publik dipetakan sebagai
berikut:

| Enum server | Tampilan publik                          | Posisi terhadap ambang                                               |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `SAFE`      | **AMAN**                                 | Semua sensor wajib valid dan berada di bawah ambang Waspada          |
| `WATCH`     | **WASPADA (TINGKAT 1)**                  | Minimal satu sensor mencapai ambang Waspada                          |
| `WARNING`   | **SIAGA (TINGKAT 2)**                    | Minimal satu sensor mencapai ambang Siaga, belum memenuhi rule Awas  |
| `DANGER`    | **AWAS (TINGKAT 3)**                     | Rule kombinasi/durasi Awas aktif                                     |
| `UNKNOWN`   | **TIDAK DIKETAHUI (status operasional)** | Data/koneksi/profil tidak dapat dipercaya; bukan Aman atau level 1–3 |

**Aman bukan Tingkat 0 maupun bagian dari tiga tingkat peringatan.** `UNKNOWN` juga bukan Aman.

## 4. Logika tingkat peringatan

### 4.1 Prasyarat data

Sebelum memberi Tingkat 1–3, backend memastikan:

- perangkat aktif;
- timestamp dipercaya;
- profil risiko aktif tersedia;
- konektivitas tidak delayed/offline;
- semua sensor wajib tersedia;
- semua nilai berada dalam rentang teknis.

Jika salah satu syarat gagal, hasilnya `UNKNOWN`/TIDAK DIKETAHUI. Kondisi tersebut tidak boleh
diturunkan menjadi Waspada dan tidak boleh dianggap aman.

### 4.2 Awas lebih dahulu

Rule Awas dievaluasi lebih dahulu agar kondisi terberat memiliki prioritas. Pada profil aktif saat
ini, internal `DANGER`/Awas terjadi jika salah satu kondisi berikut terpenuhi:

- kemiringan dan curah hujan secara bersamaan mencapai ambang Siaga masing-masing; atau
- hujan berlanjut setelah jumlah hari hujan sedang berturut-turut yang dikonfigurasi.

Rule hujan berdurasi saat ini menggunakan total harian lokal 30–50 mm/hari selama 3 hari
berturut-turut dan hujan lanjutan lebih dari 0 mm/jam sebagai nilai seed provisional. Angka ini
bukan angka universal SNI dan harus dapat diubah melalui profil.

### 4.3 Siaga

Jika tidak ada rule Awas, internal `WARNING`/Siaga terjadi ketika setidaknya satu sensor mencapai
ambang Siaga:

```text
tilt >= tiltSiaga
OR soilMoisture >= soilSiaga
OR rainfall >= rainfallSiaga
```

### 4.4 Waspada

Jika tidak ada rule Siaga atau Awas, internal `WATCH`/Waspada terjadi ketika setidaknya satu sensor
mencapai ambang Waspada:

```text
tilt >= tiltWaspada
OR soilMoisture >= soilWaspada
OR rainfall >= rainfallWaspada
```

### 4.5 Aman

Jika seluruh prasyarat valid dan semua sensor berada di bawah ambang Waspada, hasilnya
`SAFE`/Aman. Kondisi ini berada di luar tiga tingkat peringatan.

### 4.6 Boundary

Operator masuk tingkat lebih tinggi bersifat inklusif:

- nilai tepat pada ambang Waspada masuk Waspada;
- nilai tepat pada ambang Siaga masuk Siaga;
- Awas membutuhkan rule kombinasi atau durasi, bukan sekadar satu sensor melewati ambang Siaga;
- nilai di bawah seluruh ambang Waspada menjadi Aman jika seluruh prasyarat valid.

## 5. Penentuan nilai ambang

SNI 9021:2021 tidak boleh dipakai dalam aplikasi ini sebagai dalih bahwa satu set angka berlaku
untuk seluruh lereng Indonesia. Ambang pada Profil Risiko harus ditentukan dan disahkan berdasarkan:

- kajian geologi, geomorfologi, dan geoteknik lokasi;
- mekanisme gerakan tanah setempat;
- baseline dan noise tiltmeter setelah pemasangan permanen;
- kalibrasi tipping bucket dan kontinuitas data hujan;
- kalibrasi sensor kelembapan tanah;
- korelasi data sensor dengan observasi lapangan;
- prosedur tetap yang disepakati tim siaga dan otoritas lokal;
- rekomendasi ahli yang kompeten.

Nilai seeder 3°/8°, 65%/85%, dan 20/50 mm/jam tetap ditandai **PROVISIONAL** sampai proses tersebut
selesai.

## 6. Dashboard

Dashboard wajib:

- menampilkan Aman, Waspada, Siaga, atau Awas sebagai label utama;
- menjelaskan bahwa Aman berada di luar tingkat peringatan;
- menampilkan Tingkat 1, 2, atau 3 secara eksplisit untuk Waspada, Siaga, dan Awas;
- tidak menampilkan enum internal sebagai nama status operator;
- menampilkan TIDAK DIKETAHUI secara berbeda dan tidak berwarna seperti kondisi normal;
- menjelaskan bahwa ambang berasal dari profil kalibrasi lokasi;
- menamai garis ambang grafik **WASPADA** dan **SIAGA**;
- menamai posisi sensor di bawah ambang Waspada sebagai **Aman**;
- tetap menampilkan alasan, timestamp, freshness, dan gap data.

Warna yang digunakan:

- Aman: hijau;
- Waspada/Tingkat 1: kuning;
- Siaga/Tingkat 2: jingga;
- Awas/Tingkat 3: merah;
- Tidak Diketahui: abu-abu/netral.

Warna selalu disertai teks agar informasi tidak bergantung pada persepsi warna.

## 7. Telegram

Pesan transisi mencantumkan:

- label dan tingkat baru;
- label dan tingkat sebelumnya;
- lokasi dan waktu lokal;
- penyebab evaluasi;
- snapshot sensor;
- durasi hujan bila tersedia;
- tindakan yang harus dilakukan;
- tautan dashboard dan ID kejadian.

Respons pesan:

| Status/tingkat  | Arahan aplikasi                                                                     |
| --------------- | ----------------------------------------------------------------------------------- |
| Aman            | Pembacaan di bawah ambang Waspada; pemantauan rutin tetap berjalan                  |
| Waspada         | Pemantauan rutin dan memastikan perangkat/komunikasi siap                           |
| Siaga           | Meningkatkan pemantauan, verifikasi lapangan, dan menyiapkan protap evakuasi        |
| Awas            | Menghubungi tim siaga/otoritas dan menjalankan komando evakuasi resmi sesuai protap |
| Tidak Diketahui | Memeriksa perangkat, jaringan, waktu, profil, dan sensor; tidak menganggap aman     |

Bot menyampaikan hasil sistem dan arahan protap. Bot tidak menggantikan kewenangan BPBD,
pemerintah daerah, tim siaga, atau pejabat pemberi komando evakuasi.

## 8. Kesenjangan terhadap klaim kepatuhan penuh

Implementasi saat ini belum boleh disebut “bersertifikat SNI 9021:2021” atau “sepenuhnya memenuhi
SNI 9021:2021”, antara lain karena:

- belum dilakukan audit klausul terhadap salinan resmi standar;
- belum ada ekstensometer pada perangkat;
- belum ada sirene dan lampu rotary fisik;
- threshold masih provisional;
- identitas IMU `WHO_AM_I=0x70` belum mengonfirmasi silikon MPU6050;
- enclosure, proteksi lingkungan, catu daya lapangan, dan pemeliharaan belum diaudit terhadap
  spesifikasi standar;
- kalibrasi terakreditasi dan uji lapangan jangka panjang belum tersedia;
- Telegram dan dashboard tidak menggantikan diseminasi lokal/sirene serta protap masyarakat.

Frasa yang boleh digunakan:

> Terminologi tingkat peringatan diselaraskan ke Waspada–Siaga–Awas dan rancangan perangkat
> mengacu pada konteks SNI 9021:2021/SNI 8235:2017, dengan ambang berbasis profil kalibrasi lokasi.

## 9. Verifikasi implementasi

Test minimal harus membuktikan:

- pemetaan `SAFE → Aman` di luar tingkat peringatan;
- pemetaan `WATCH → Waspada/Tingkat 1`;
- pemetaan `WARNING → Siaga/Tingkat 2`;
- pemetaan `DANGER → Awas/Tingkat 3`;
- `UNKNOWN` tidak mendapat nomor tingkat dan tidak dianggap Aman;
- dashboard, detail sensor, grafik, profil risiko, audit log, dan Telegram memakai istilah yang sama;
- exact threshold memasuki tingkat lebih tinggi;
- rule hujan berdurasi tetap menghasilkan Awas;
- pesan Awas mengarahkan pengguna mengikuti komando/protap resmi;
- migration enum `WARNING` bersifat aditif dan API mendokumentasikan status baru.

## 10. Tindak lanjut sebelum penggunaan resmi

1. Dapatkan salinan resmi SNI 9021:2021 dan SNI 8235:2017 melalui BSN.
2. Buat matriks kepatuhan per klausul beserta bukti uji.
3. Libatkan ahli geoteknik/hidrologi, BPBD/otoritas lokal, dan perwakilan masyarakat.
4. Tentukan ambang berdasarkan site dan dokumentasikan metode serta tanggal kalibrasi.
5. Tambahkan ekstensometer serta perangkat peringatan lokal jika diwajibkan hasil audit.
6. Susun dan sahkan prosedur tetap untuk Waspada, Siaga, Awas, kegagalan alat, dan komunikasi.
7. Jalankan geladi berkala dan catat hasil evaluasi/perawatan.
