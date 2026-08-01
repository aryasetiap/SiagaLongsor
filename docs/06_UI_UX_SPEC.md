# UI/UX Specification

Referensi visual utama: `assets/ui-reference-dashboard.png`.

## 1. Arah visual

- Desktop-first, responsif.
- Latar aplikasi abu-abu sangat muda.
- Card putih dengan border lembut dan radius 16–20 px.
- Navigasi atas berbentuk pill.
- Warna biru untuk primary action.
- Hierarki visual bersih, tidak cyberpunk.
- Banyak whitespace.
- Data padat tetapi tidak terlihat sesak.

## 2. Design tokens awal

```css
:root {
  --app-bg: #eef2f5;
  --surface: #ffffff;
  --border: #e5e7eb;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --primary: #0b82f0;
  --safe: #0b8f55;
  --watch: #f59e0b;
  --danger: #e00000;
  --unknown: #6b7280;
  --radius-card: 18px;
  --radius-control: 999px;
}
```

Warna final harus diuji kontras. Status tidak boleh dibedakan dengan warna saja; gunakan ikon dan label.

## 3. Navigation

Desktop top navigation:

- Overview.
- Monitoring.
- Alerts.
- Map & Evacuation.
- Devices.
- Reports.
- Settings.

Project Owner melihat Settings lengkap. School Admin melihat submenu yang diizinkan.

Mobile:

- Overview.
- Monitoring.
- Alerts.
- More.

## 4. Overview layout

### KPI row

Empat stat cards:

1. Monitoring Points.
2. Critical Alerts.
3. Devices Offline.
4. New Alerts.

Setiap card:

- Label kecil.
- Nilai besar.
- Context `generatedAt`/window bila membantu pengguna.
- Delta periode dan mini visualization hanya bila API menyediakan data historis authoritative.
- Klik menuju filter terkait.

Phase 04 tidak memiliki historical snapshot untuk aggregate current risk/connectivity. UI tidak
boleh membuat delta, tren, atau mini visualization perkiraan. KPI wajib memakai
`GET /dashboard/summary`, bukan menghitung satu halaman Monitoring Overview atau Alert list.

### Main content

Grid desktop:

- Kiri 3/4: Monitoring Overview table.
- Kanan 1/4: Risk Distribution donut.

### Bottom content

- Kiri 2/3: Sensor Trend.
- Kanan 1/3: Alert & Notification list.

Mapping data Phase 04:

- KPI dan Risk Distribution: `GET /dashboard/summary`;
- Monitoring table: `GET /monitoring-overview`;
- Sensor Trend: `GET /monitoring-points/{monitoringPointId}/sensor-series`;
- Recent Alerts: `GET /alerts` dengan sort terbaru dan limit kecil;
- Alert detail dan assessment history memakai endpoint Phase 03 existing.

## 4.1 Sensor Trend presentation

- Chart wajib memiliki ringkasan tekstual yang dapat dibaca screen reader.
- Satu data point tetap ditampilkan sebagai point dengan unit, bukan garis atau tren palsu.
- Empty series menampilkan empty state, bukan grafik bernilai nol.
- Gap waktu harus terlihat sebagai gap; frontend tidak menginterpolasi atau menghubungkan gap
  seolah data tersedia.
- Saat `includeLate=true`, late point memiliki label atau legend yang dapat dipahami tanpa warna.
- Nullable sensor tetap ditampilkan sebagai tidak tersedia, bukan nol.
- No-data dan offline tidak divisualisasikan sebagai nilai nol atau SAFE.
- Timestamp ditampilkan memakai timezone Site bila tersedia, sambil mempertahankan timestamp UTC
  dari API sebagai sumber.
- Unit baku: tilt derajat, soil moisture persen, rainfall mm/jam, dan battery volt.
- Pemilihan chart library ditunda ke implementation PR.

## 5. Monitoring table

Kolom:

- No.
- Location.
- Risk Status.
- Tilt.
- Soil Moisture.
- Rainfall.
- Last Update.
- Action.

Behavior:

- Sticky header.
- Search dan filter.
- Sort risk descending.
- Empty state.
- Skeleton loading.
- Offline row memiliki badge `UNKNOWN / OFFLINE`.
- Tidak menampilkan angka lama tanpa label stale.

## 6. Risk status presentation

### SAFE

- Badge hijau.
- Icon check/shield.
- Teks “Aman”.

### WATCH

- Badge amber.
- Icon warning.
- Teks “Waspada”.

### DANGER

- Badge merah.
- Icon siren/triangle.
- Teks “Bahaya”.
- Card alert lebih menonjol, tetapi hindari animasi berlebihan.

### UNKNOWN

- Badge abu-abu.
- Icon disconnected/question.
- Teks alasan: offline, delayed, invalid, atau maintenance.

## 7. Alert interaction

Acknowledge menggunakan dialog, tidak satu klik langsung.

Field:

- Catatan tindakan.
- Kondisi lapangan.
- SOP dijalankan atau tidak.
- Konfirmasi waktu.

Critical alert:

- Banner di bagian atas.
- Quick access ke SOP.
- Tombol acknowledge jelas.
- Tidak ada tombol dismiss tanpa alasan.

## 8. Device detail

Header:

- Nama dan hardware ID.
- Status koneksi.
- Risk status point.
- Last seen.

Cards:

- Battery.
- Signal RSSI.
- Firmware.
- Network type terakhir.
- Queue/backlog bila dikirim firmware.

Tabs:

- Telemetry.
- Status history.
- Alerts.
- Maintenance.
- Configuration.

## 9. Map

- Marker warna status.
- Legend jelas.
- Tooltip lokasi dan last update.
- Layer zona risiko.
- Layer jalur evakuasi.
- Tombol akses SOP.
- Fallback static image bila WebGL/map gagal.

## 10. Responsive rules

- > = 1280 px: layout penuh seperti referensi.
- 768–1279 px: KPI 2x2, main grid 2/3 + 1/3.
- < 768 px: semua card stack, table menjadi cards atau horizontal scroll.
- Aksi critical tetap terlihat tanpa scroll panjang.

## 11. Accessibility

- Keyboard navigation.
- Focus ring terlihat.
- ARIA label pada icon-only button.
- Chart memiliki ringkasan tekstual.
- Status dan late-data legend memakai ikon serta label, bukan warna saja.
- Kontras minimum sesuai WCAG AA.
- Jangan hanya mengandalkan warna.
- Gunakan format angka dan unit konsisten.

## 12. Copywriting

Gunakan Bahasa Indonesia sebagai default:

- “Terakhir diperbarui 2 menit lalu”.
- “Data terlambat”.
- “Perangkat tidak terhubung”.
- “Status tidak dapat ditentukan”.
- “Peringatan telah diterima oleh …”.

Hindari istilah teknis tanpa tooltip untuk pengguna sekolah.

## 13. Phase 05 alert operations and realtime

Alert detail menampilkan status, severity, alasan, lokasi, waktu observasi terakhir, occurrence,
serta timeline event immutable. Aksi selalu berupa dialog terfokus dengan validasi inline dan
konfirmasi status akhir; tombol tidak boleh mengandalkan warna saja.

- Dialog acknowledge tersedia untuk kedua role dan meminta catatan, kondisi lapangan, serta
  konfirmasi apakah SOP dijalankan.
- Dialog resolve hanya untuk `PROJECT_OWNER`, meminta resolution note, dan hanya tersedia pada
  status `ACKNOWLEDGED`.
- Dialog false alarm hanya untuk `PROJECT_OWNER`, meminta alasan, dan tersedia pada `ACTIVE` atau
  `ACKNOWLEDGED`.
- Setiap pembukaan dialog menghasilkan UUID v4 `actionId` baru; retry request yang sama memakai ID
  yang sama. Setelah hasil terminal atau dialog dibatalkan, ID tidak digunakan kembali.
- Conflict status memicu refetch dan pesan bahwa kondisi telah berubah, bukan overwrite optimistik.
- `SCHOOL_ADMIN` tidak melihat control resolve/false alarm; backend tetap menjadi boundary izin.

Realtime memakai fetch-based SSE agar bearer dan header organisasi dapat dikirim. Event hanya
menandai resource untuk di-refetch; UI tidak mengganti authoritative state langsung dari payload
SSE. Setelah disconnect UI menampilkan status koneksi nonblocking, reconnect dengan jittered
backoff 1/2/5/10/30 detik, lalu refetch. Initial connect juga melakukan REST fetch. Burst event
di-coalesce agar tidak menyebabkan request storm. Pergantian organisasi dan logout menutup stream
sebelumnya.

Quick access SOP membuka dokumen yang memang tersedia. Jika belum ada, tampilkan “SOP resmi belum
tersedia” dan jangan membuat instruksi darurat sintetis. Halaman audit hanya tersedia untuk
`PROJECT_OWNER` pada `/settings/audit-log`, mendukung filter dan cursor history, serta tidak
menampilkan metadata JSON mentah, data transport, atau secret.

## 14. Phase 06 map, SOP, dan reports UI contract

### Map

Halaman `/map` wajib memiliki Site selector dari API, legend text+icon, marker dengan nama,
risk/connectivity, last update, dan tautan detail. Polygon harus diberi label “zona referensi
statis”; route diberi label “jalur evakuasi manual”. Layer tidak boleh menyiratkan prediksi,
geocoder, directions, atau routing otomatis. Jika WebGL/provider gagal, fallback accessible list
tetap menampilkan informasi authoritative. Site belum dikonfigurasi menampilkan empty state jujur,
bukan koordinat atau marker palsu. Delayed/offline/unknown tidak boleh berwarna/berlabel SAFE.

`PROJECT_OWNER` dapat membuka editor konfigurasi dengan validasi koordinat, polygon, route,
preview, dan konfirmasi. Conflict version memicu refetch dan meminta pengguna mengulang perubahan;
tidak melakukan overwrite diam-diam. `SCHOOL_ADMIN` hanya read-only.

### SOP

Quick access menampilkan metadata active SOP dan tombol authenticated download. Frontend mengambil
blob memakai bearer + organization header, membuat object URL sementara, lalu revoke. Jika SOP
belum ada, tampilkan “SOP resmi belum tersedia” tanpa membuat prosedur sintetis.

Owner mendapat upload dialog dengan PDF-only hint, ukuran maksimal 10 MiB, progress/loading,
validation error, dan konfirmasi bahwa versi baru menjadi aktif. Riwayat versi memakai Load More
cursor. Admin tidak melihat upload control. Filename tidak dirender sebagai HTML dan file tidak
pernah dimuat melalui public URL.

### Reports

Halaman `/reports` menyediakan Site/rentang waktu, CSV download, pembuatan PDF job, status, dan
authenticated artifact download. Rentang maksimum 31 hari dijelaskan sebelum submit. Job baru
masuk `QUEUED`; UI polling setiap 3 detik dengan backoff terbatas pada error sementara dan berhenti
pada `SUCCEEDED`, `FAILED`, `EXPIRED`, navigasi keluar, organization switch, atau unmount. Tombol
regenerate membuat job baru. UI tidak mengarang progress percentage atau failure detail.

Download failure/expiry ditampilkan sebagai state yang dapat ditindaklanjuti. PDF dijelaskan
sebagai snapshot “Status saat laporan dibuat”, bukan keadaan live. Semua form, layer toggle,
dialog, status, dan download dapat dioperasikan keyboard, memiliki focus ring, serta tidak
mengandalkan warna saja.
