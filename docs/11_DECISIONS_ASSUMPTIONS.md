# Decisions, Assumptions, and Open Questions

## 1. Keputusan yang dikunci

| ID | Keputusan | Status |
|---|---|---|
| D-001 | Implementasi awal 1 alat, model mendukung banyak alat | Accepted |
| D-002 | Wi-Fi primary dan modem seluler fallback | Accepted |
| D-003 | Role aktif: Project Owner dan School Admin | Accepted |
| D-004 | HTTPS ingestion untuk MVP | Accepted |
| D-005 | SSE untuk dashboard realtime | Accepted |
| D-006 | Tidak ada remote siren control pada MVP | Accepted |
| D-007 | Offline/stale = UNKNOWN, bukan SAFE | Accepted |
| D-008 | Threshold configurable dan versioned | Accepted |
| D-009 | Server dan firmware sama-sama menghitung risk | Accepted |
| D-010 | UI mengikuti gaya dashboard referensi | Accepted |

## 2. Asumsi awal

- Satu site awal: SMAN 17 Bandar Lampung.
- Satu monitoring point aktif pada peluncuran pertama.
- Telemetry normal dikirim sekitar setiap 15 menit pada SAFE dan lebih sering saat WATCH/DANGER.
- Server dapat di-host pada VPS/cloud dengan HTTPS.
- Project Owner memiliki akses teknis untuk maintenance.
- Admin sekolah memiliki perangkat untuk membuka web dashboard.

## 3. Pertanyaan terbuka sebelum production

- Modem seluler berupa router Wi-Fi atau modul langsung ke ESP32?
- Operator membutuhkan notifikasi email, WhatsApp, SMS, atau kombinasi?
- Berapa interval telemetry untuk tiap status setelah uji daya?
- Siapa ahli yang menyetujui threshold final?
- Apakah peta sekolah tersedia dalam format GIS atau hanya gambar/PDF?
- Berapa lama data mentah harus disimpan?
- Apakah server menggunakan infrastruktur Unila atau VPS independen?
- Apakah perlu akses publik terbatas?
- Apakah battery percentage dapat dihitung atau hanya voltage?
- Apakah firmware mampu menyimpan queue lokal dan berapa kapasitasnya?

## 4. Risiko proyek

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Sensor murah tidak stabil | False alert/missed signal | Kalibrasi, filtering, redundancy rule, maintenance |
| Internet putus | Dashboard kehilangan data live | Local siren, buffer, dual connectivity |
| Threshold belum tervalidasi | Status tidak akurat | Versioning dan persetujuan ahli |
| Power budget kurang | Device offline | Uji daya lapangan, battery monitoring |
| Modem meningkatkan konsumsi | Durasi baterai turun | Network policy, sleep, router option evaluation |
| Operator tidak merespons | Alert tidak ditindaklanjuti | SOP, pelatihan, escalation notification |
| Credential bocor | Data palsu | Secret unik, rotate, rate limit, HMAC future |

## 5. Change control

Setiap keputusan yang mengubah prinsip keselamatan, threshold, role, atau remote control harus dicatat sebagai ADR baru dan disetujui pemilik proyek.
