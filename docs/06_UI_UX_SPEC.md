# UI/UX Specification

## 1. Scope navigasi

Navigasi utama produk terdiri tepat dari:

1. Overview
2. Perangkat
3. Profil Risiko
4. Audit Log

Login adalah supporting flow, bukan item navigasi utama. Catatan UI lama untuk Monitoring, Alerts, Map & Evacuation, Reports, dan Settings telah disupersede oleh scope reset R1 dan bukan target UI final.

## 2. Prinsip umum

- Tampilkan status dengan teks dan ikon selain warna; gunakan loading, empty, error, dan no-data state yang eksplisit.
- Timestamp ditampilkan jelas beserta freshness; API memakai UTC/ISO 8601 dan UI dapat mengonversinya ke WIB.
- Nilai `null`/no-data tidak pernah menjadi `0`, dan data stale tidak dipresentasikan sebagai current/fresh.
- Polling periodik dengan refetch aman untuk scope ini. SSE tidak diperlukan.
- UI tidak mengendalikan sirene dan tidak menyimpulkan risiko sendiri.

## 3. Overview

Status bahaya saat ini menjadi elemen dominan dan selalu menampilkan label `SAFE`, `WATCH`, `DANGER`, atau `UNKNOWN`, ikon, alasan/freshness bila tersedia, dan waktu update terakhir.

Tampilkan nilai terbaru setiap sensor relevan bahaya beserta unit, timestamp, dan keadaan no-data. Sediakan chart time-series independen per sensor. Chart mempertahankan celah missing data dan tidak menginterpolasi di antara titik yang tidak ada. Ringkasan tekstual yang setara dengan chart dan status wajib tersedia untuk aksesibilitas.

`UNKNOWN` harus jelas untuk data offline, stale, invalid, atau required data unavailable; kondisi tersebut tidak boleh tampak sebagai `SAFE`.

## 4. Perangkat

Halaman diagnostik satu perangkat ini menampilkan status koneksi backend/perangkat, `last seen`, dan keadaan connected/disconnected/unknown. Setiap sensor expected menampilkan readable, unreadable, atau unknown; pembacaan stale tidak ditampilkan sebagai current.

Firmware version, hardware identity, battery, dan health diagnostik dapat ditampilkan hanya bila authoritative. Battery/health tidak dilabeli sebagai threshold bahaya longsor.

## 5. Profil Risiko

Tampilkan field editable threshold `WATCH` dan `DANGER` untuk sensor bahaya yang relevan. Validasi format, satuan, required field, dan kombinasi threshold sebelum submit; tampilkan kesalahan dekat field. Minta konfirmasi sebelum menerapkan perubahan.

Tampilkan version dan updated time bila tersedia. Jangan mengisi placeholder atau nilai final ilmiah yang tidak authoritative; nilai existing ditandai provisional/legacy sampai kalibrasi.

## 6. Audit Log

Utamakan daftar transisi hazard status. Setiap row/detail menyajikan timestamp, previous/current status, alasan, dan snapshot sensor serta referensi profil risiko bila tersedia. Urutan terbaru lebih dahulu dan pagination digunakan bila riwayat bertumbuh. Perubahan threshold dapat muncul sebagai audit konfigurasi, tetapi acknowledge/resolve/false-alarm bukan interaksi UI target.

## 7. Aksesibilitas dan responsif

Semua status dapat dipahami tanpa warna saja, fokus keyboard terlihat, tabel/chart memiliki ringkasan teks, dan ukuran layar kecil menumpuk panel tanpa menyembunyikan freshness atau no-data state.
