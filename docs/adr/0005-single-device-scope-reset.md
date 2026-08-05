# ADR-0005: Scope Reset ke Dashboard Satu Perangkat

- Status: Accepted
- Tanggal: 2026-08-05

## Konteks

Arahan supervisor mengganti scope final produk sebelumnya yang luas—multi-device, organization/site, dua role, alert lifecycle, map, SOP, reports, dan realtime—dengan dashboard riset untuk satu ESP32 fisik. Implementasi lama dan evidencenya tetap ada, tetapi tidak lagi mendefinisikan produk final.

## Keputusan

- Produk final memiliki empat halaman: Overview, Perangkat, Profil Risiko, dan Audit Log.
- Authentication administrator, health check, credential device, ingestion idempotent, persistence, risk evaluation server-side, current state/history, dan auditability tetap dipertahankan.
- Workstream baru memakai replacement-before-deletion; kapabilitas lama tidak dihapus sebelum replacement dan dependency analysis tervalidasi.
- Firmware ESP32 mengikuti stabilisasi kontrak telemetry, backend, dashboard, dan simulator, bukan mendahuluinya.
- Fitur extensibility sebelumnya dihapus dari scope final karena tidak diperlukan untuk satu implementasi riset dan menambah kompleksitas operasional tanpa nilai produk yang disetujui.
- Invarian retained: telemetry stale/offline/invalid/unavailable adalah `UNKNOWN`, bukan `SAFE`; risk engine server-side deterministic; threshold configurable/auditable; tidak ada remote siren atau AI hazard prediction.

## Konsekuensi

- ADR-0001 SSE dan ADR-0003 multi-device tetap catatan keputusan historis, tetapi disupersede sebagai arah produk final oleh ADR ini.
- Redis/BullMQ, SSE, object storage, dan schema/domain lama menjadi kandidat cleanup bertahap, bukan target penghapusan R1.
- Target API dan UI dikontrakkan ulang secara contract-first pada R2 sebelum atau bersama perubahan implementasi.
