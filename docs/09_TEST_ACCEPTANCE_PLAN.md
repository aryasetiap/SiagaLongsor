# Test and Acceptance Plan

## 1. Status dokumen

Kriteria Phase 01–07 dan bukti pada `docs/14` sampai `docs/18` adalah **historical/pre-scope-reset**. Bukti tersebut tidak dihapus atau diubah, tetapi tidak menjadi acceptance final untuk produk satu-perangkat. P7-02 smoke/load/stress evidence, bila ada, hanya baseline sebelum reset dan bukan penerimaan production final.

Acceptance final dibangun bertahap melalui R1–R10. Tidak ada hasil test yang diklaim oleh dokumen ini; setiap status PASS memerlukan evidence run setelah implementasi scope baru stabil.

## 2. Acceptance scope baru

### Overview

- Nilai current authoritative dirender dengan unit, timestamp, dan freshness yang benar.
- Histori sensor relevan tersedia sebagai chart independen.
- Celah/null dipertahankan; tidak ada interpolasi menyeberangi gap atau nilai nol palsu.
- Status risiko berasal dari evaluasi server authoritative.
- Telemetry stale, offline, invalid, atau required data unavailable menghasilkan `UNKNOWN`, tidak pernah `SAFE`.

### Perangkat

- Status connected, disconnected, dan unknown ditampilkan benar beserta `last seen`.
- Setiap sensor required menunjukkan readable, unreadable, atau unknown.
- Pembacaan stale tidak dipresentasikan sebagai current.
- Firmware/hardware/battery hanya ditampilkan bila sumbernya authoritative dan tidak mengubah kriteria hazard tanpa persetujuan.

### Profil Risiko

- Update threshold valid tersimpan dan digunakan oleh evaluasi deterministic.
- Tidak ada hard-coded-only truth; profile/version yang aktif dapat dijelaskan.
- Perubahan konfigurasi menghasilkan audit yang memadai.
- Kombinasi threshold invalid ditolak sebelum penerapan dan UI meminta konfirmasi.
- Test tidak membuat atau mengasumsikan nilai ilmiah/geoteknis baru.

### Audit Log

- Transisi status disimpan dan ditampilkan dengan previous/current status serta timestamp.
- State yang tidak berubah tidak menghasilkan duplicate transition entry.
- Alasan, snapshot sensor, dan referensi profil tersedia bila ada.
- Riwayat immutable/auditable; audit konfigurasi threshold tetap dapat ditelusuri.

### Telemetry

- Ingestion valid diterima dengan credential perangkat yang sah.
- `(deviceId, messageId)` unik/idempotent; retry duplicate memberi perilaku aman tanpa duplikasi histori/state/transisi.
- Credential invalid ditolak tanpa membocorkan secret.
- Required sensor invalid menghasilkan penolakan/karantina terstruktur dan tidak dapat menghasilkan `SAFE`.
- Data terlambat disimpan untuk histori namun tidak menggantikan current state yang lebih baru.

## 3. Jenis bukti dan gate

- Unit test: risk engine pure/deterministic, urutan `UNKNOWN` dan validasi profile.
- Integration test: ingestion, idempotency, persistence, current state, audit, dan authorization.
- Browser/E2E: empat halaman, loading/error/empty/no-data/accessibility state dan update profil.
- Contract validation: target OpenAPI direvisi pada R2 sebelum atau bersama perubahan runtime.
- Performance: ingestion dan endpoint dashboard minimal diuji setelah R1–R8 stabil; acceptance performance final harus dijalankan ulang, bukan mewarisi P7-02.

## 4. Kriteria release final

R10 hanya dapat diputuskan setelah acceptance R8, firmware/integrasi R9 yang relevan, dan performance/UAT scope final memiliki evidence aktual. Tidak ada ketentuan historical yang mengaktifkan release final secara otomatis.
