# Panduan Lengkap Proyek dan Penggunaan Alat SiagaLongsor

> Status: draf dokumentasi teknis dan operasional. Dokumen ini dapat diberikan
> kepada GPT atau anggota tim sebagai konteks awal, tetapi konfigurasi lapangan,
> kalibrasi sensor, ambang risiko, dan prosedur evakuasi tetap harus disahkan oleh
> pihak yang kompeten.

## 1. Tujuan dokumen

Dokumen ini menjelaskan proyek SiagaLongsor secara menyeluruh, mulai dari
arsitektur perangkat lunak, cara menjalankan sistem, cara memasang dan menguji
alat ESP32, alur pengiriman telemetri, perhitungan tingkat risiko, penggunaan
dashboard, integrasi Telegram, hingga penanganan masalah umum.

Dokumen ini juga dirancang sebagai **handoff context untuk GPT**. Sebelum
membagikannya, jangan pernah menambahkan isi `.env`, `secrets.h`, password,
token Telegram, device secret, session cookie, atau credential produksi.

## 2. Ringkasan proyek

SiagaLongsor adalah implementasi riset sistem pemantauan longsor untuk **satu
perangkat fisik ESP32** pada satu titik pemantauan. Perangkat membaca:

- kemiringan melalui IMU/tiltmeter;
- kelembapan tanah melalui sensor kapasitif;
- curah hujan melalui tipping bucket;
- kualitas koneksi Wi-Fi;
- status internal pengiriman telemetri.

Data dikirim melalui HTTP/HTTPS ke backend. Backend menyimpan data di
PostgreSQL, menghitung status risiko, menyediakan data untuk dashboard, membuat
audit log, dan mengirim notifikasi Telegram ketika status berubah.

Sistem ini adalah implementasi riset. Sistem **bukan pengganti penilaian ahli,
alat standar resmi, atau prosedur tanggap darurat dan evakuasi**.

## 3. Ruang lingkup dan batasan

### 3.1 Kemampuan utama

- menerima telemetri terautentikasi dari satu ESP32;
- menyimpan histori pembacaan sensor;
- menampilkan overview publik tanpa login;
- menyediakan halaman administrasi untuk pemilik proyek;
- menghitung Aman, Waspada (Tingkat 1), Siaga (Tingkat 2), Awas (Tingkat 3),
  atau Tidak Diketahui di server;
- mendeteksi hujan sedang yang berlanjut beberapa hari;
- mencatat perubahan risiko dalam audit log;
- mengirim notifikasi Telegram saat status berubah;
- menampilkan pembacaan lokal pada LCD 1602A;
- menyediakan mode presentasi dengan data sintetis.

### 3.2 Batasan yang diketahui

- ambang bawaan masih bersifat provisional, bukan standar ilmiah universal;
- alat hanya menggunakan satu titik dan satu perangkat aktif;
- identitas IMU `WHO_AM_I=0x70` belum mengonfirmasi bahwa silikon benar-benar
  MPU6050, walaupun komunikasi dan pembacaan kompatibel dapat bekerja;
- firmware belum menyimpan antrean telemetri secara permanen di flash;
- antrean RAM hilang jika ESP32 dimatikan atau restart;
- belum ada rangkaian pengukuran baterai, sehingga `batteryVoltage` bernilai
  `null`;
- belum ada RTC, SD card, koneksi seluler, atau sirene fisik;
- tidak ada prediksi bahaya berbasis AI;
- tidak ada aktuasi evakuasi otomatis;
- notifikasi Telegram bersifat best-effort dan bukan satu-satunya kanal darurat;
- satu instance API bukan arsitektur high availability;
- proyek terbaru tidak menggunakan Redis.

## 4. Arsitektur sistem

```text
Sensor kemiringan ---\
Sensor tanah ---------> ESP32 ---> HTTP/HTTPS ---> NestJS API
Tipping bucket -------/    |                         |
                          LCD 1602A                 +--> PostgreSQL
                                                      |
                                                      +--> Risk evaluator
                                                      |
                                                      +--> Notification outbox
                                                      |       |
                                                      |       +--> Telegram Bot API
                                                      |
                                                      +--> Next.js dashboard
```

### 4.1 Komponen perangkat lunak

| Komponen | Teknologi                                           | Fungsi                                            |
| -------- | --------------------------------------------------- | ------------------------------------------------- |
| Web      | Next.js 16, React 19, TypeScript, Tailwind, ECharts | Dashboard publik dan panel administrasi           |
| API      | NestJS 11, TypeScript                               | Telemetri, autentikasi, risiko, audit, notifikasi |
| Database | PostgreSQL 16 dan Prisma 7                          | Penyimpanan data utama dan outbox notifikasi      |
| Firmware | ESP32, Arduino framework, PlatformIO                | Akuisisi sensor, LCD, dan pengiriman HTTP/HTTPS   |
| Telegram | Telegram Bot API                                    | Notifikasi perubahan kondisi                      |

### 4.2 Sumber kebenaran status risiko

Backend adalah satu-satunya sumber kebenaran untuk status risiko. ESP32 hanya
membaca sensor dan mengirim telemetri. LCD sengaja tidak menyatakan status
Waspada, Siaga, atau Awas, agar perangkat tidak membuat keputusan yang
berbeda dari server.

### 4.3 Tidak ada Redis

Versi proyek saat ini hanya membutuhkan PostgreSQL untuk operasi lokal normal.
Antrean notifikasi Telegram disimpan dalam tabel PostgreSQL
`NotificationOutbox`. Apabila masih muncul error dari `ioredis`, biasanya ada
proses lama, dependency lama, build cache lama, atau branch lama yang masih
berjalan; itu bukan dependency arsitektur terbaru.

## 5. Struktur direktori penting

```text
SiagaLongsor/
├── apps/
│   ├── api/                 # Backend NestJS
│   └── web/                 # Dashboard Next.js
├── firmware/
│   └── esp32/
│       ├── include/
│       │   ├── secrets.example.h
│       │   └── secrets.h    # Lokal, rahasia, tidak boleh di-commit
│       ├── src/
│       │   └── main.cpp
│       └── platformio.ini
├── packages/                # Contract/shared package monorepo
├── prisma/                  # Schema, migration, dan seed database
├── scripts/                 # Script operasi dan presentasi
├── docs/                    # Dokumentasi proyek
├── compose.yaml             # PostgreSQL lokal
├── .env.example
└── package.json
```

## 6. Persyaratan pengembangan

- Windows 10/11 dan PowerShell;
- Node.js `>=24.0.0 <25`;
- Corepack dan pnpm `10.34.5`;
- Docker Desktop dengan WSL 2 backend;
- Git;
- PlatformIO Core atau extension PlatformIO untuk VS Code;
- driver USB-to-UART sesuai chip board, misalnya Silicon Labs CP210x;
- kabel USB data yang baik, bukan kabel charge-only.

Verifikasi versi:

```powershell
node --version
corepack pnpm --version
docker --version
docker compose version
git --version
```

## 7. Menjalankan proyek secara lokal

Semua perintah berikut dijalankan dari root repository:

```powershell
cd D:\pakrismi\SiagaLongsor
```

### 7.1 Membuat konfigurasi lokal

```powershell
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env.local
```

Isi `.env` dan `apps/web/.env.local` seperlunya. Jangan commit kedua file
tersebut.

Konfigurasi web lokal yang umum:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_PRESENTATION_MODE=false
```

### 7.2 Memasang dependency

```powershell
corepack enable
corepack pnpm install
```

Jika muncul `ERR_PNPM_UNSUPPORTED_ENGINE`, pastikan terminal memakai Node.js
24, kemudian tutup dan buka kembali terminal agar `PATH` diperbarui.

### 7.3 Menjalankan PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

Database lokal dipublikasikan pada port `55432`. Compose terbaru tidak memiliki
service Redis.

### 7.4 Menyiapkan Prisma dan data awal

```powershell
corepack pnpm prisma:generate
corepack pnpm prisma:migrate:deploy
corepack pnpm prisma:seed
```

Seeder membuat data awal untuk pengembangan, termasuk organisasi, site, titik
pemantauan, akun pengujian, perangkat demo, dan profil risiko provisional sesuai
konfigurasi repository.

### 7.5 Menjalankan backend dan frontend

Buka dua terminal terpisah.

Terminal API:

```powershell
corepack pnpm --filter @siagalongsor/api dev
```

Terminal web:

```powershell
corepack pnpm --filter @siagalongsor/web dev
```

Alamat lokal:

- dashboard: `http://localhost:3000`;
- API: `http://localhost:3001/api/v1`;
- health check: `http://localhost:3001/api/v1/health`;
- PostgreSQL host port: `55432`.

Tes health check:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
```

### 7.6 Menghentikan aplikasi

Hentikan proses API dan web dengan `Ctrl+C`, lalu:

```powershell
docker compose down
```

Perintah tersebut mempertahankan volume database. Jangan menambahkan `-v`
apabila data lokal masih dibutuhkan.

## 8. Mode presentasi dan data dummy

Mode presentasi menjalankan lingkungan terisolasi dengan data sintetis yang
melewati API dan evaluator risiko yang sebenarnya. Data ini hanya untuk demo,
bukan data lapangan dan bukan dasar keselamatan.

```powershell
corepack pnpm presentation:setup
corepack pnpm presentation:start
corepack pnpm presentation:status
corepack pnpm presentation:open
```

Alamat default mode presentasi:

- web: `http://localhost:3003`;
- API: `http://localhost:3002/api/v1`;
- PostgreSQL: `55433`.

Menghentikan mode presentasi:

```powershell
corepack pnpm presentation:stop
```

Gunakan `presentation:reset` hanya jika benar-benar ingin mereset data
presentasi sesuai konfirmasi script.

## 9. Akses dan halaman dashboard

### 9.1 Overview publik

Overview dapat dilihat tanpa login dan hanya bersifat read-only. Halaman ini
menampilkan:

- status risiko terbaru;
- waktu observasi dan status koneksi;
- nilai kemiringan, kelembapan tanah, dan curah hujan;
- grafik histori setiap sensor;
- garis ambang risiko;
- nilai minimum, rata-rata, dan maksimum;
- filter waktu cepat dan kalender;
- dialog detail sensor ketika kartu histori diklik.

Filter cepat mencakup rentang seperti 5 menit, 15 menit, 1 jam, dan 6 jam.
Filter kalender mendukung pemilihan harian, mingguan, dan bulanan sehingga
pengguna dapat memilih tanggal, minggu, atau bulan tertentu.

Data publik tidak boleh mengekspos device secret, identitas sensitif perangkat,
konfigurasi penuh, atau audit administratif.

### 9.2 Perangkat

Halaman ini tersedia untuk Project Owner dan menampilkan antara lain:

- hardware ID dan nama perangkat;
- firmware;
- status konektivitas;
- terakhir terlihat dan telemetri terakhir;
- Wi-Fi/RSSI;
- status keterbacaan sensor;
- baterai jika perangkat keras pengukurnya tersedia.

### 9.3 Profil Risiko

Halaman ini dipakai untuk melihat dan mengelola:

- threshold kemiringan;
- threshold kelembapan tanah;
- threshold curah hujan;
- aturan hujan berdurasi beberapa hari;
- rentang teknis sensor;
- parameter konektivitas;
- versi dan status kalibrasi profil.

Perubahan profil harus dilakukan secara terkontrol karena memengaruhi hasil
klasifikasi. Profil baru dicatat sebagai versi baru dan dapat menghasilkan audit
perubahan.

### 9.4 Audit Log

Audit Log mencatat perubahan penting, khususnya transisi status risiko dan
konteks yang mendasarinya. Halaman ini tidak dibuka untuk publik.

### 9.5 Peran pengguna

- **Project Owner**: dapat membuka Overview, Perangkat, Profil Risiko, dan Audit
  Log.
- **School Admin/operator sekolah**: aksesnya dibatasi pada overview sesuai
  kebijakan produk saat ini.
- **Publik**: dapat melihat overview read-only tanpa login.

Setelah login sebagai Project Owner, aplikasi seharusnya mengarahkan pengguna
ke panel yang sesuai tanpa membutuhkan langkah akses tambahan yang tidak perlu.

## 10. Cara backend menentukan status risiko

### 10.1 Status yang digunakan

| Tampilan Indonesia  | Status internal | Arti ringkas                                                     |
| ------------------- | --------------- | ---------------------------------------------------------------- |
| AMAN                | `SAFE`          | Seluruh data valid dan berada di bawah ambang Waspada            |
| WASPADA (TINGKAT 1) | `WATCH`         | Setidaknya satu nilai mencapai ambang Waspada                    |
| SIAGA (TINGKAT 2)   | `WARNING`       | Setidaknya satu nilai mencapai ambang Siaga, tetapi belum Awas   |
| AWAS (TINGKAT 3)    | `DANGER`        | Rule kombinasi atau aturan hujan berkelanjutan terpenuhi         |
| TIDAK DIKETAHUI     | `UNKNOWN`       | Data tidak cukup, tidak valid, terlambat, atau perangkat offline |

Aman berada di luar tiga tingkat peringatan. `UNKNOWN` bukan Aman. Rincian dasar, pemetaan, dan
batas klaim kepatuhan terdapat di `docs/32_SNI_9021_STATUS_ALIGNMENT.md`.

### 10.2 Urutan evaluasi

Backend mengevaluasi kondisi secara berurutan:

1. Jika perangkat nonaktif, timestamp tidak dipercaya, profil tidak tersedia,
   perangkat terlambat/offline, sensor wajib hilang, atau nilai di luar rentang
   teknis, hasilnya `UNKNOWN`.
2. Jika rule kombinasi/durasi Awas terpenuhi, hasilnya internal `DANGER`/Awas Tingkat 3.
3. Jika minimal satu sensor mencapai ambang Siaga, hasilnya `WARNING`/Siaga Tingkat 2.
4. Jika minimal satu sensor mencapai ambang Waspada, hasilnya `WATCH`/Waspada Tingkat 1.
5. Jika seluruh sensor berada di bawah ambang Waspada, hasilnya `SAFE`/Aman.

`UNKNOWN` tidak boleh dianggap Aman (`SAFE`).

### 10.3 Nilai seed provisional

Nilai awal dari seeder saat ini adalah:

| Sensor/aturan      | Ambang Waspada | Ambang Siaga |
| ------------------ | -------------: | -----------: |
| Kemiringan         |      3 derajat |    8 derajat |
| Kelembapan tanah   |            65% |          85% |
| Curah hujan sesaat |      20 mm/jam |    50 mm/jam |

Semantik batasnya inklusif untuk memasuki level berikutnya:

- tepat 3°, 65%, atau 20 mm/jam masuk internal `WATCH`/Waspada Tingkat 1;
- tepat 8°, 85%, atau 50 mm/jam masuk internal `WARNING`/Siaga Tingkat 2;
- Awas membutuhkan kombinasi kemiringan tinggi dan hujan tinggi atau rule hujan berdurasi.

Nilai ini hanya konfigurasi riset awal. Jangan mengklaimnya sebagai standar
resmi tanpa validasi ahli geoteknik/hidrologi dan kalibrasi lapangan.

### 10.4 Aturan hujan berdasarkan durasi

Selain curah hujan sesaat, backend memiliki aturan hujan berkelanjutan:

- total hujan setiap hari lengkap berada pada rentang 30–50 mm/hari;
- kondisi tersebut terjadi selama 3 hari berturut-turut;
- pada hari berikutnya masih ada hujan, yaitu pembacaan saat ini lebih dari
  0 mm/jam;
- hasil evaluasi dinaikkan menjadi internal `DANGER`/Awas Tingkat 3.

Perhitungan harian menggunakan zona waktu site, misalnya `Asia/Jakarta` pada
seed. Hari yang tidak memiliki data lengkap atau memiliki total di luar rentang
akan memutus rangkaian hari berturut-turut.

Backend mengintegrasikan sampel mm/jam menjadi total harian dengan membawa laju
hingga sampel berikutnya, tetapi kontribusi satu sampel dibatasi maksimal 60
detik. Karena itu kontinuitas telemetri sangat penting.

### 10.5 Kemiringan dan kombinasi sensor

Kemiringan yang telah dikoreksi terhadap titik referensi dibandingkan langsung
dengan threshold profil. Konfigurasi seed saat ini menghasilkan internal
`WATCH`/Waspada mulai 3° dan internal `WARNING`/Siaga mulai 8°.

Internal `DANGER`/Awas dipicu saat kemiringan dan curah hujan sama-sama mencapai
ambang Siaga. Aturan kombinasi ini harus:

- didefinisikan eksplisit di backend;
- dilengkapi test batas;
- terdokumentasi pada Profil Risiko;
- tidak menyatakan standar evakuasi resmi tanpa dasar yang disahkan.

Ekstensometer belum menjadi bagian perangkat pada implementasi saat ini.

### 10.6 Konektivitas

Konfigurasi seed menggunakan:

- hingga 20 menit sejak telemetri terakhir: `ONLINE`;
- lebih dari 20 sampai 35 menit: `DELAYED`;
- lebih dari 35 menit: `OFFLINE`.

Perangkat `DELAYED` atau `OFFLINE` menghasilkan risiko `UNKNOWN`. Pemeriksaan
konektivitas terjadwal berjalan sekitar setiap 5 menit, sehingga perubahan
status karena koneksi tidak selalu instan.

### 10.7 Telemetri terlambat dan idempotensi

Telemetri terlambat tetap dapat disimpan sebagai histori, tetapi tidak boleh
menggantikan kondisi live dengan data yang lebih tua. Backend juga mendukung
idempotensi melalui:

- pasangan `deviceId` dan `messageId`;
- pasangan `deviceId`, `bootId`, dan `sequence`.

## 11. Komponen perangkat keras

Daftar komponen minimum:

- ESP32 DOIT DevKit V1;
- IMU/tiltmeter I2C pada alamat `0x68`;
- sensor kelembapan tanah kapasitif, misalnya Capacitive Soil Moisture V2.0;
- tipping bucket rain gauge dengan dry contact;
- LCD 1602A/HD44780 tanpa backpack I2C;
- potensiometer 10 kΩ untuk kontras LCD;
- resistor pembatas arus backlight sesuai modul;
- breadboard/konektor yang baik;
- kabel USB data dan sumber daya stabil.

Semua modul harus memiliki **common ground**.

## 12. Pinout lengkap

### 12.1 IMU/tiltmeter I2C

| Pin sensor | ESP32              | Catatan                                         |
| ---------- | ------------------ | ----------------------------------------------- |
| VCC        | 3V3                | Jangan memakai 5 V jika modul tidak mengizinkan |
| GND        | GND                | Common ground                                   |
| SDA        | GPIO21             | Jalur data I2C                                  |
| SCL        | GPIO22             | Jalur clock I2C                                 |
| INT        | Tidak disambungkan | Tidak digunakan firmware saat ini               |

Alamat I2C yang diharapkan adalah `0x68`.

### 12.2 Sensor kelembapan tanah kapasitif

| Pin sensor | ESP32  | Catatan                                       |
| ---------- | ------ | --------------------------------------------- |
| VCC        | 3V3    | Membatasi output analog agar aman untuk ESP32 |
| GND        | GND    | Common ground                                 |
| AOUT       | GPIO34 | ADC1, input-only, maksimum 3,3 V              |

Jangan memberi tegangan analog lebih dari 3,3 V ke GPIO34.

### 12.3 Tipping bucket

| Kabel sensor | ESP32  | Catatan                                          |
| ------------ | ------ | ------------------------------------------------ |
| Kontak 1     | GPIO27 | Menggunakan `INPUT_PULLUP` dan interrupt falling |
| Kontak 2     | GND    | Dry contact                                      |

Tipping bucket pada konfigurasi ini diperlakukan sebagai sakelar pasif. Jangan
memberi 5 V ke GPIO27.

### 12.4 LCD 1602A paralel mode 4-bit

Urutan pin LCD perlu dibaca dari label PCB, bukan hanya dari posisi visual,
karena orientasi modul dapat terbalik.

| Pin LCD | Nama | Sambungan                          | Catatan                                         |
| ------: | ---- | ---------------------------------- | ----------------------------------------------- |
|       1 | VSS  | GND                                | Ground logika                                   |
|       2 | VDD  | 5 V sesuai datasheet LCD           | Pastikan modul memang mendukung konfigurasi ini |
|       3 | V0   | Kaki tengah potensiometer 10 kΩ    | Pengatur kontras                                |
|       4 | RS   | GPIO13                             | Register select                                 |
|       5 | RW   | GND                                | Mode write-only                                 |
|       6 | E    | GPIO14                             | Enable                                          |
|       7 | D0   | Tidak disambungkan                 | Tidak digunakan pada mode 4-bit                 |
|       8 | D1   | Tidak disambungkan                 | Tidak digunakan pada mode 4-bit                 |
|       9 | D2   | Tidak disambungkan                 | Tidak digunakan pada mode 4-bit                 |
|      10 | D3   | Tidak disambungkan                 | Tidak digunakan pada mode 4-bit                 |
|      11 | D4   | GPIO16                             | Data                                            |
|      12 | D5   | GPIO17                             | Data                                            |
|      13 | D6   | GPIO18                             | Data                                            |
|      14 | D7   | GPIO19                             | Data                                            |
|      15 | A    | Positif backlight melalui resistor | Awali misalnya 220 Ω dan cek datasheet/modul    |
|      16 | K    | GND                                | Negatif backlight                               |

Sambungan potensiometer kontras:

- kaki luar pertama ke VDD LCD;
- kaki luar kedua ke GND;
- kaki tengah/wiper ke V0.

GPIO ESP32 tidak tahan 5 V. Karena `RW` dihubungkan ke GND, LCD tidak membaca
balik ke ESP32. Jika LCD 5 V tidak mengenali level HIGH 3,3 V dari ESP32,
gunakan buffer level satu arah pada RS, E, dan D4–D7.

## 13. Konfigurasi firmware

Salin template konfigurasi:

```powershell
cd D:\pakrismi\SiagaLongsor\firmware\esp32
Copy-Item include\secrets.example.h include\secrets.h
```

Struktur konfigurasi yang aman untuk didokumentasikan:

```cpp
#pragma once

#define WIFI_SSID "<SSID_WIFI>"
#define WIFI_PASSWORD "<PASSWORD_WIFI>"

#define API_BASE_URL "http://<HOST_API>:3001/api/v1"
#define API_CA_CERT ""

#define DEVICE_HARDWARE_ID "<HARDWARE_ID>"
#define DEVICE_SECRET "<SECRET_SEKALI_TAMPIL>"

#define SOIL_ADC_DRY 3200
#define SOIL_ADC_WET 1400

#define TILT_REFERENCE_X_DEG 0.0F
#define TILT_REFERENCE_Y_DEG 0.0F
#define TILT_REFERENCE_CALIBRATED false

#define RAIN_MM_PER_TIP 0.70F
```

Catatan penting:

- `API_BASE_URL` harus sudah menyertakan `/api/v1`;
- alamat `localhost` pada ESP32 menunjuk ke ESP32 sendiri, bukan laptop;
- untuk backend lokal, gunakan alamat IPv4 laptop pada jaringan yang sama;
- jika IP laptop berubah, perbarui konfigurasi dan upload ulang firmware;
- buka akses firewall hanya untuk port dan jaringan yang diperlukan;
- `secrets.h` tidak boleh masuk commit atau dibagikan ke GPT.

### 13.1 HTTPS dan CA certificate

Untuk URL `https://`, firmware mewajibkan root/intermediate CA yang sesuai.
Tanpa CA, serial menampilkan:

```text
HTTPS requires API_CA_CERT; telemetry deferred
```

Format multi-line yang dapat digunakan:

```cpp
static constexpr char API_CA_CERT_VALUE[] = R"EOF(
-----BEGIN CERTIFICATE-----
<ISI_CA_CERTIFICATE>
-----END CERTIFICATE-----
)EOF";

#define API_CA_CERT API_CA_CERT_VALUE
```

Gunakan CA certificate dari rantai TLS domain, bukan private key server. Jangan
menonaktifkan verifikasi TLS pada produksi hanya agar koneksi berhasil.

## 14. Registrasi perangkat ke backend

ESP32 mengirim header autentikasi berbentuk konseptual:

```text
Authorization: Device <hardwareId>.<deviceSecret>
```

Alur provisioning:

1. Login sebagai Project Owner pada backend target.
2. Pastikan organisasi, site, dan monitoring point yang benar telah tersedia.
3. Daftarkan satu perangkat aktif pada monitoring point tersebut.
4. Simpan secret yang hanya ditampilkan satu kali.
5. Masukkan hardware ID dan secret ke `secrets.h`.
6. Build dan upload firmware.
7. Pastikan serial menunjukkan `telemetry delivered status=201` atau respons
   duplicate yang diterima.

Hardware ID harus menggunakan huruf kapital/angka/underscore/hyphen sesuai
kontrak, panjang 3–64 karakter, misalnya `SIAGALONGSOR-001`.

Jika registrasi menghasilkan
`MONITORING_POINT_ACTIVE_DEVICE_CONFLICT`, monitoring point sudah memiliki
perangkat aktif. Jangan membuat perangkat kedua secara buta. Pilih salah satu:

- gunakan credential perangkat aktif yang benar;
- rotasi credential perangkat aktif;
- nonaktifkan/ganti perangkat melalui prosedur administrasi yang disetujui.

Secret lama tidak dapat dibaca kembali dari database karena disimpan sebagai
hash. Jika hilang, lakukan rotasi credential. Credential database lokal tidak
otomatis berlaku pada database produksi.

## 15. Compile, upload, dan serial monitor

### 15.1 PlatformIO tersedia di PATH

```powershell
cd D:\pakrismi\SiagaLongsor\firmware\esp32
pio run
pio run --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

Ganti `COM5` dengan port ESP32 pada komputer.

### 15.2 PlatformIO belum tersedia di PATH

Contoh bila PlatformIO terpasang di `D:\PlatformIO`:

```powershell
& 'D:\PlatformIO\penv\Scripts\platformio.exe' run
& 'D:\PlatformIO\penv\Scripts\platformio.exe' run --target upload --upload-port COM5
& 'D:\PlatformIO\penv\Scripts\platformio.exe' device monitor --port COM5 --baud 115200
```

Mengatur `PLATFORMIO_CORE_DIR` tidak otomatis menambahkan perintah `pio` ke
`PATH`. Buka terminal baru setelah memperbarui `PATH`, atau gunakan executable
lengkap seperti contoh di atas.

### 15.3 Menemukan port perangkat

```powershell
Get-PnpDevice -Class Ports -PresentOnly |
  Format-Table Status, FriendlyName, InstanceId -AutoSize
```

Port `Standard Serial over Bluetooth` bukan port ESP32. Untuk board dengan
CP210x, nama yang benar biasanya menyerupai:

```text
Silicon Labs CP210x USB to UART Bridge (COMx)
```

Jika driver CP210x sudah diunduh, instal dengan klik kanan `silabser.inf` lalu
pilih **Install**, atau:

```powershell
pnputil /add-driver "<PATH_DRIVER>\silabser.inf" /install
```

### 15.4 Jika upload gagal terhubung

1. Tutup serial monitor dan aplikasi lain yang memakai COM.
2. Jalankan upload.
3. Saat terminal menampilkan `Connecting...`, tahan tombol **BOOT**.
4. Jika perlu tekan singkat **EN/RESET** sambil tetap menahan BOOT.
5. Lepaskan BOOT setelah proses koneksi mulai.
6. Lepas sementara perangkat dari pin boot-strapping bila ada.
7. Jika masih bermasalah, turunkan `upload_speed` menjadi `115200`.

Pesan `Invalid head of packet` umumnya menunjukkan ESP32 belum masuk bootloader,
gangguan serial, power tidak stabil, atau peripheral mengganggu proses boot.

## 16. Cara kerja firmware

### 16.1 Siklus utama

1. ESP32 boot dan membuat `bootId` baru.
2. LCD diinisialisasi dalam mode paralel 4-bit.
3. Firmware memeriksa identitas IMU.
4. Sensor dibaca sekitar setiap 5 detik.
5. Rain window dihitung setiap 60 detik.
6. ESP32 menyambung ke Wi-Fi.
7. Waktu disinkronkan melalui NTP.
8. Sampel valid dimasukkan ke antrean RAM.
9. Telemetri dikirim melalui HTTP/HTTPS ke `/iot/telemetry`.
10. Backend menyimpan, mengevaluasi risiko, dan memperbarui dashboard.

Selama NTP belum tersedia, sensor tetap dibaca tetapi telemetri ditunda agar
timestamp tidak salah.

### 16.2 Antrean telemetri

- kapasitas antrean RAM: 4 sampel;
- antrean tidak persisten dan hilang saat reboot;
- respons `201` berarti telemetri baru diterima;
- respons duplicate yang valid juga dianggap selesai;
- error jaringan, `429`, atau `5xx` dijadwalkan ulang;
- error permanen `4xx` dibuang setelah diklasifikasikan;
- retry dibatasi agar RAM tidak tumbuh tanpa batas.

### 16.3 LCD

LCD berganti halaman sekitar setiap 5 detik:

- halaman kemiringan dan kelembapan tanah;
- halaman curah hujan, RSSI Wi-Fi, dan kedalaman antrean.

Nilai yang belum tersedia ditampilkan sebagai `--`, bukan angka nol. Log
`LCD1602 ready` hanya membuktikan kode inisialisasi dijalankan, bukan membuktikan
wiring dan LCD fisik bekerja.

## 17. Kalibrasi dan pengujian sensor

### 17.1 IMU/tiltmeter

Rumus pembacaan dasar firmware:

```text
tiltX = atan2(ay, az)
tiltY = atan2(-ax, sqrt(ay^2 + az^2))
tiltMagnitude = sqrt(tiltX^2 + tiltY^2)
```

Prosedur kalibrasi titik nol:

1. Pasang sensor dengan kuat pada orientasi netral yang akan dipakai di
   lapangan.
2. Set `TILT_REFERENCE_CALIBRATED` ke `false`.
3. Upload firmware dan biarkan perangkat diam.
4. Ambil banyak pembacaan kandidat X/Y dalam beberapa menit, bukan satu sampel.
5. Gunakan nilai representatif yang stabil sebagai
   `TILT_REFERENCE_X_DEG` dan `TILT_REFERENCE_Y_DEG`.
6. Set `TILT_REFERENCE_CALIBRATED` ke `true`.
7. Build dan upload ulang.
8. Verifikasi pembacaan mendekati nol pada posisi netral.

Jika nilai tetap berubah besar ketika alat diam, periksa:

- sensor tidak terpasang kaku;
- kabel I2C longgar atau terlalu panjang;
- common ground buruk;
- sumber daya berisik/tidak stabil;
- getaran meja atau enclosure;
- identitas IMU `WHO_AM_I=0x70` dan kompatibilitasnya;
- kebutuhan filtering/averaging firmware yang belum diterapkan.

Jangan menyesuaikan titik referensi hanya agar grafik terlihat nol jika noise
fisik dan identitas perangkat belum dipahami.

### 17.2 Kelembapan tanah

Firmware mengambil rata-rata 4 pembacaan ADC dan memetakannya ke 0–100%.

Prosedur:

1. Catat ADC saat probe berada pada kondisi kering yang didefinisikan untuk
   kalibrasi.
2. Catat ADC saat probe berada pada kondisi basah yang didefinisikan.
3. Masukkan hasilnya ke `SOIL_ADC_DRY` dan `SOIL_ADC_WET`.
4. Pastikan kedua nilai tidak nol dan tidak sama.
5. Upload ulang dan uji pada beberapa kondisi antara.

Nilai `soil raw` membuktikan ADC membaca tegangan, tetapi belum membuktikan
persentase sudah akurat. Nilai `0` pada sensor yang dilepas bukan kelembapan 0%;
itu dapat berarti input tidak terhubung.

### 17.3 Tipping bucket

Firmware menghitung:

```text
rainfallMmHour = jumlahTip × mmPerTip × 3.600.000 / intervalMs
```

Dengan window 60 detik, `14` tip dan `0,70 mm/tip` akan menghasilkan `588
mm/jam`. Angka tersebut adalah ekstrapolasi laju satu menit, bukan otomatis
total hujan nyata selama satu jam.

Uji elektronik tanpa hujan:

1. Hubungkan GPIO27 singkat ke GND untuk mensimulasikan satu tip.
2. Beri jarak lebih dari 50 ms untuk setiap tip karena terdapat debounce.
3. Tunggu rain window 60 detik selesai.
4. Periksa log `rain window tips=... rainfallMmHour=...`.

Kalibrasi fisik harus menggunakan volume air terukur dan luas kolektor sesuai
mekanisme tipping bucket. Nilai `0.70 mm/tip` adalah nilai nominal dan harus
divalidasi. Sensor pasif yang terlepas dapat tampak sama seperti kondisi tidak
hujan, sehingga inspeksi fisik tetap diperlukan.

### 17.4 LCD

Urutan pengujian:

1. Uji LCD dan ESP32 tanpa sensor lain untuk mengurangi beban power.
2. Pastikan VSS, VDD, A, K, dan common ground benar.
3. Putar potensiometer V0 perlahan dari ujung ke ujung.
4. Pada kondisi power tetapi sebelum inisialisasi, satu baris blok gelap biasanya
   dapat terlihat pada kontras tertentu.
5. Sambungkan RW ke GND.
6. Verifikasi RS, E, D4, D5, D6, dan D7 satu per satu.
7. Restart ESP32 dan lihat serial serta LCD.

Diagnosis cepat:

| Gejala                                 | Penyebab yang mungkin                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Tidak ada cahaya biru                  | A/K terbalik, backlight tidak diberi daya, resistor/supply salah                  |
| Cahaya biru tetapi tidak ada blok/teks | V0 salah, pot tidak terhubung benar, VSS/VDD/common ground bermasalah             |
| Blok gelap tetapi tidak ada teks       | RS/E/RW/D4–D7 salah atau inisialisasi/data tidak sampai                           |
| Karakter acak                          | Urutan data tertukar, kabel longgar, noise, power drop, atau restart saat menulis |

## 18. Membaca log serial

Contoh log sehat:

```text
SiagaLongsor ESP32 firmware ...
LCD1602 ready 4-bit size=16x2 RS=13 E=14 D4=16 D5=17 D6=18 D7=19
soil ADC pin=34 calibration=ready ...
rain pulse pin=27 nominal_mm_per_tip=...
Wi-Fi connected ip=... rssi=...
telemetry queued depth=1 messageId=...
telemetry delivered status=201 duplicate=false
```

Arti log umum:

| Log                                       | Arti/tindakan                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `WHO_AM_I=0x70`                           | IMU menjawab, tetapi bukan identitas MPU6050 yang terkonfirmasi            |
| `tilt sensor unavailable`                 | IMU tidak dapat dibaca; cek alamat, power, SDA/SCL                         |
| `soil raw=... calibration=ready`          | ADC terbaca dan parameter dry/wet tersedia                                 |
| `clock unavailable... telemetry deferred` | NTP belum siap; tunggu internet/DNS dan cek jaringan                       |
| `status=-1`                               | Koneksi HTTP/TLS gagal, host salah, API mati, firewall, atau CA bermasalah |
| `status=401`                              | Hardware ID/secret salah atau credential berasal dari database lain        |
| `status=400`                              | Payload tidak sesuai kontrak/rentang; periksa log backend                  |
| `queue full; sample dropped`              | Backend lama tidak terjangkau dan empat slot RAM telah penuh               |
| `delivered status=201`                    | Telemetri baru berhasil diterima backend                                   |
| `Brownout detector was triggered`         | Tegangan ESP32 turun/tidak stabil                                          |

Jika brownout terjadi:

1. lepaskan seluruh sensor dan LCD;
2. uji board dengan kabel USB data yang baik;
3. pindah port USB atau gunakan sumber daya yang memadai;
4. sambungkan peripheral satu per satu;
5. pastikan backlight LCD dan sensor tidak membebani regulator secara berlebihan;
6. gunakan common ground dan kabel pendek;
7. jangan menonaktifkan brownout detector sebagai solusi utama.

## 19. Alur data dari alat ke dashboard

1. Sensor menghasilkan pembacaan fisik.
2. ESP32 mengubah pembacaan menjadi derajat, persen, dan mm/jam.
3. Timestamp diperoleh setelah sinkronisasi NTP.
4. Sampel diberi `messageId`, `bootId`, dan `sequence`.
5. ESP32 mengirim POST terautentikasi ke API.
6. API memvalidasi credential, timestamp, rentang, dan idempotensi.
7. Data disimpan di PostgreSQL.
8. Risk evaluator membaca profil aktif dan histori hujan jika diperlukan.
9. Status live diperbarui jika sampel lebih baru.
10. Overview mengambil snapshot dan histori dari API.
11. Jika status berubah, backend membuat outbox notifikasi Telegram.
12. Worker mengirim notifikasi dan mencatat hasilnya.

## 20. Integrasi Telegram

Telegram dijalankan oleh backend, bukan oleh ESP32. Token bot tidak boleh
dimasukkan ke firmware.

### 20.1 Mendapatkan token dan chat ID

1. Buka Telegram dan cari `@BotFather`.
2. Jalankan `/newbot` dan ikuti petunjuk.
3. Simpan bot token secara rahasia.
4. Tambahkan bot ke chat/grup/channel target.
5. Kirim satu pesan atau trigger update pada chat tersebut.
6. Ambil `chat.id` melalui endpoint `getUpdates`.
7. Untuk forum topic, catat juga `message_thread_id` jika digunakan.

Contoh PowerShell tanpa menuliskan token di command history:

```powershell
$secureToken = Read-Host 'Telegram bot token' -AsSecureString
$token = [System.Net.NetworkCredential]::new('', $secureToken).Password
$updates = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getUpdates"

$chats = foreach ($update in $updates.result) {
  if ($null -ne $update.message) { $update.message.chat }
  if ($null -ne $update.channel_post) { $update.channel_post.chat }
}

$chats | Sort-Object id -Unique |
  Format-Table id, type, title, username -AutoSize

Remove-Variable token, secureToken
```

Jika hasil kosong, kirim pesan baru ke bot/grup, pastikan bot sudah menjadi
anggota, lalu panggil `getUpdates` kembali. Webhook aktif juga dapat membuat
`getUpdates` tidak mengembalikan update seperti yang diharapkan.

### 20.2 Konfigurasi `.env`

```dotenv
TELEGRAM_NOTIFICATIONS_ENABLED=true
TELEGRAM_BOT_TOKEN=<TOKEN_BOT>
TELEGRAM_CHAT_ID=<CHAT_ID>
TELEGRAM_MESSAGE_THREAD_ID=
TELEGRAM_DASHBOARD_URL=https://<DOMAIN>/overview
```

Restart backend setelah mengubah `.env`.

### 20.3 Kapan pesan dikirim

Notifikasi dibuat ketika terjadi **transisi status**, misalnya:

- Aman (`SAFE`) menjadi Waspada (`WATCH`);
- Waspada menjadi Siaga (`WARNING`);
- Siaga menjadi Awas (`DANGER`);
- status menjadi `UNKNOWN` karena data/koneksi;
- status kembali membaik.

Sistem tidak mengirim ulang pesan yang sama setiap beberapa menit jika status
tidak berubah. Worker memeriksa outbox sekitar setiap 5 detik. Evaluasi offline
terjadwal sekitar setiap 5 menit.

Kegagalan sementara seperti network error, `408`, `429`, atau `5xx` dicoba ulang
dengan backoff, maksimum sesuai konfigurasi worker. Telegram dapat mengirim
duplikat langka pada pola at-least-once, sehingga penerima tetap harus melihat
timestamp dan konteks pesan.

### 20.4 Memeriksa outbox

Pada PowerShell, kirim SQL melalui stdin agar tanda kutip nama tabel tidak rusak:

```powershell
'SELECT "createdAt", "status", "attemptCount", "lastErrorCode", "sentAt" FROM "NotificationOutbox" ORDER BY "createdAt" DESC LIMIT 10;' |
  docker exec -i siagalongsor-dev-postgres-1 psql -U siagalongsor -d siagalongsor
```

Tidak adanya row baru biasanya berarti tidak ada transisi status setelah fitur
diaktifkan, bukan berarti worker pasti rusak.

## 21. Troubleshooting aplikasi

### 21.1 Docker tidak dikenali

- pastikan Docker Desktop benar-benar terpasang dan berjalan;
- tutup dan buka terminal setelah instalasi;
- periksa `docker --version`;
- pastikan lokasi executable Docker masuk `PATH`;
- perpindahan disk image ke drive D tidak otomatis memperbaiki executable yang
  belum terpasang.

### 21.2 Pull image menghasilkan EOF/CloudFront error

- coba jaringan lain atau Cloudflare WARP jika kebijakan jaringan mengizinkan;
- restart Docker Desktop;
- jalankan `docker pull postgres:16-alpine` dan `docker pull redis...` hanya jika
  branch lama memang memerlukannya; branch saat ini tidak memerlukan Redis;
- jika `hello-world` berhasil tetapi layer besar gagal, masalah sering berada
  pada jalur CDN, proxy, antivirus, atau koneksi yang memutus download besar.

### 21.3 PostgreSQL meminta password environment

Pastikan `.env` dibuat dari `.env.example` dan variabel PostgreSQL terisi.
Jangan menaruh password tersebut dalam dokumentasi atau screenshot publik.

### 21.4 API tidak menerima telemetri lokal

- pastikan ESP32 dan laptop berada di jaringan yang sama;
- cek IPv4 laptop dengan `ipconfig`;
- perbarui `API_BASE_URL` jika IP berubah;
- pastikan API listen di port 3001 dan bukan hanya loopback jika dibutuhkan;
- cek Windows Firewall;
- uji health endpoint dari perangkat lain pada jaringan;
- pastikan NTP sudah sinkron;
- cocokkan hardware ID dan secret dengan database yang sedang aktif.

### 21.5 Error `401`

`401` bukan masalah sensor. Penyebab paling umum:

- `DEVICE_HARDWARE_ID` salah;
- `DEVICE_SECRET` salah atau telah dirotasi;
- credential lokal digunakan ke produksi atau sebaliknya;
- perangkat dinonaktifkan;
- backend mengarah ke database yang berbeda.

### 21.6 Error `ioredis: Connection is closed`

Karena arsitektur terbaru tidak menggunakan Redis:

1. hentikan semua proses Node lama;
2. pastikan branch dan working tree terbaru;
3. cari referensi Redis/ioredis di source dan script yang benar-benar dijalankan;
4. hapus build cache aplikasi yang aman diregenerasi, bukan data pengguna;
5. instal dependency dari lockfile terbaru;
6. jalankan ulang API dari root repository;
7. pastikan terminal tidak menjalankan output build dari branch lama.

Jangan menghapus volume PostgreSQL untuk menyelesaikan error Redis.

### 21.7 Grafik ECharts meminta series yang belum di-import

Jika console menampilkan contoh seperti `Series scatter is used but not
imported`, chart type tersebut harus diimpor dari `echarts/charts` dan
didaftarkan melalui `echarts.use(...)`. Setelah perbaikan, bersihkan cache build
web dan jalankan ulang hanya jika cache masih memuat bundle lama.

## 22. Verifikasi kualitas sebelum push/PR

Jalankan dari root repository:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
corepack pnpm prisma:validate
corepack pnpm openapi:validate
```

Kemudian periksa:

```powershell
git status --short
git diff --check
```

Untuk firmware:

```powershell
cd firmware\esp32
& 'D:\PlatformIO\penv\Scripts\platformio.exe' run
```

Jangan menyatakan seluruh verifikasi lulus jika ada command yang tidak
dijalankan atau gagal. Catat hasil aktual dalam deskripsi PR.

## 23. Checklist sebelum penggunaan lapangan

### 23.1 Perangkat keras

- [ ] enclosure, konektor, dan mounting sensor kuat;
- [ ] seluruh ground terhubung bersama;
- [ ] tidak ada GPIO ESP32 menerima tegangan di atas 3,3 V;
- [ ] supply stabil dan tidak memicu brownout;
- [ ] LCD terbaca pada kondisi terang/gelap yang relevan;
- [ ] IMU terpasang kaku dan orientasi dicatat;
- [ ] sensor tanah terlindung sesuai spesifikasi;
- [ ] tipping bucket bergerak bebas dan kontak terbaca;
- [ ] kabel luar ruang, grounding, proteksi air, dan proteksi petir dinilai ahli.

### 23.2 Kalibrasi

- [ ] titik nol tilt ditetapkan dari banyak sampel stabil;
- [ ] dry/wet ADC ditentukan dari prosedur terdokumentasi;
- [ ] mm/tip divalidasi menggunakan volume terukur;
- [ ] threshold risiko ditinjau pihak kompeten;
- [ ] zona waktu site benar;
- [ ] periode online/delayed/offline sesuai kebutuhan operasi.

### 23.3 Backend dan jaringan

- [ ] device terdaftar pada monitoring point yang benar;
- [ ] credential produksi digunakan hanya pada produksi;
- [ ] HTTPS dan CA certificate valid;
- [ ] NTP dapat diakses;
- [ ] telemetri menghasilkan status `201`;
- [ ] overview menampilkan timestamp dan data terbaru;
- [ ] audit transition tercatat;
- [ ] Telegram diuji dengan transisi terkontrol;
- [ ] prosedur saat internet mati sudah disiapkan.

### 23.4 Keselamatan

- [ ] sistem tidak dijadikan satu-satunya dasar evakuasi;
- [ ] masyarakat/operator memahami arti `UNKNOWN`;
- [ ] ada inspeksi manual dan kanal komunikasi cadangan;
- [ ] data demo tidak tercampur dengan data lapangan;
- [ ] semua keterbatasan perangkat dicatat pada laporan penelitian.

## 24. Operasi harian yang disarankan

1. Buka Overview dan cek timestamp observasi terbaru.
2. Pastikan konektivitas `ONLINE`, bukan hanya melihat angka sensor.
3. Periksa apakah grafik menunjukkan gap data.
4. Bandingkan sensor dengan kondisi fisik lapangan.
5. Tinjau notifikasi dan Audit Log jika status berubah.
6. Jika status `UNKNOWN`, periksa perangkat/jaringan; jangan mengasumsikan aman.
7. Jika status Siaga atau Awas, ikuti prosedur resmi yang disahkan, bukan
   hanya keputusan dari dashboard.
8. Catat perawatan, kalibrasi ulang, perubahan profil, dan penggantian perangkat.

## 25. Praktik keamanan

- simpan `.env` dan `firmware/esp32/include/secrets.h` hanya di lingkungan lokal
  yang aman;
- jangan commit token Telegram, password, device secret, atau credential akun;
- rotasi credential yang pernah muncul di chat, screenshot, log publik, atau
  repository;
- batasi akun Project Owner dan gunakan password kuat;
- gunakan HTTPS pada produksi;
- jangan menonaktifkan validasi TLS;
- batasi akses database dan port internal;
- jangan memberikan data pribadi atau credential saat meminta bantuan GPT;
- gunakan credential terpisah untuk lokal, presentasi, staging, dan produksi.

## 26. Informasi yang aman diberikan kepada GPT

Saat meminta GPT menganalisis proyek, berikan:

- dokumen ini;
- pesan error yang sudah disensor;
- nama file dan potongan kode yang relevan;
- hasil command tanpa token/password;
- foto wiring yang tidak memperlihatkan credential;
- versi branch/commit jika diperlukan.

Jangan berikan:

- `.env` asli;
- `secrets.h` asli;
- bot token dan chat ID pribadi;
- password akun;
- private key TLS;
- cookie/session/JWT;
- dump database produksi yang mengandung data sensitif.

## 27. Template prompt untuk GPT

Salin template ini bersama dokumen yang sudah disensor:

```text
Anda membantu saya mengembangkan proyek SiagaLongsor.

Gunakan dokumen terlampir sebagai konteks arsitektur dan operasional. Sebelum
memberi solusi:
1. bedakan perilaku firmware, backend, database, dashboard, dan Telegram;
2. pertahankan backend sebagai sumber kebenaran status risiko;
3. jangan pernah mengubah UNKNOWN menjadi SAFE;
4. jangan menganggap threshold provisional sebagai standar ilmiah universal;
5. jangan menambahkan Redis karena versi terbaru menggunakan PostgreSQL;
6. jangan meminta atau menampilkan secret;
7. pertahankan kompatibilitas satu perangkat fisik aktif;
8. sertakan test untuk perubahan logika risiko dan kontrak;
9. jelaskan dampak keamanan, database, API, firmware, dan UX;
10. jangan melakukan commit/push kecuali saya meminta secara eksplisit.

Tugas saya:
<TULIS REVISI ATAU MASALAH DI SINI>

Kondisi saat ini/pesan error:
<TEMPEL DATA YANG SUDAH DISENSOR>

Hasil yang saya inginkan:
<TULIS ACCEPTANCE CRITERIA>
```

## 28. Dokumen repository terkait

Untuk detail yang lebih spesifik, baca juga dokumentasi repository berikut:

- `README.md` untuk quick start dan status proyek;
- `AGENTS.md` untuk invariant dan batasan implementasi;
- `docs/22_R9_PROVISIONING_AND_FIELD_CHECKLIST.md` untuk provisioning,
  instalasi, dan checklist lapangan;
- `docs/28_PRODUCTION_DEPLOYMENT_OPERATIONS.md` untuk operasi produksi;
- `docs/30_TELEGRAM_NOTIFICATIONS.md` untuk integrasi Telegram;
- `docs/PRESENTATION_DEMO.md` untuk mode presentasi;
- `firmware/esp32/README.md` untuk firmware;
- `firmware/esp32/include/secrets.example.h` untuk template konfigurasi.

## 29. Penutup

Alur inti SiagaLongsor adalah **sensor → ESP32 → HTTP/HTTPS → API → PostgreSQL
→ evaluasi risiko → dashboard/audit/Telegram**. Keandalan hasil tidak hanya
ditentukan oleh kode, tetapi juga oleh kualitas pemasangan, catu daya,
kalibrasi, kontinuitas jaringan, validitas profil risiko, dan prosedur respons
manusia.

Dokumen ini harus diperbarui setiap kali terjadi perubahan pada pinout, kontrak
telemetri, threshold, metode kalibrasi, peran pengguna, infrastruktur, atau
prosedur notifikasi.
