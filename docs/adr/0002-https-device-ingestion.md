# ADR-0002: HTTPS untuk Device Ingestion MVP

- Status: Accepted
- Tanggal: 2026-07-29

## Konteks

Device memakai Wi-Fi sebagai koneksi utama dan koneksi seluler sebagai fallback. Retry dari kedua
jalur harus memakai kontrak serta idempotency key yang sama.

## Keputusan

Gunakan endpoint HTTPS untuk ingestion MVP. MQTT tidak menjadi dependensi aplikasi pada fase awal.

## Konsekuensi

- Device dapat memakai mekanisme HTTP yang umum pada kedua jalur jaringan.
- Keamanan transport membutuhkan TLS di production.
- Authentication, validation, dan idempotency device dikerjakan pada fase ingestion, bukan Phase 01.
