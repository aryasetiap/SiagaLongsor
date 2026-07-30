# ADR-0003: Model Domain Multi-Device

- Status: Accepted
- Tanggal: 2026-07-29

## Konteks

Peluncuran awal hanya memakai satu device dan satu site, tetapi ekspansi tidak boleh memerlukan
perubahan arsitektur utama.

## Keputusan

Organization dan Site dimodelkan sebagai entitas kolektif sejak migration pertama. Entitas
MonitoringPoint dan Device baru ditambahkan secara relasional pada fase terkait; tidak akan ada
singleton device di konfigurasi atau API.

## Konsekuensi

- Foundation mendukung banyak organization dan site secara struktural.
- Membership MVP bersifat organization-scoped.
- Site scope dapat ditambahkan ke authorization tanpa mengganti identitas user.
