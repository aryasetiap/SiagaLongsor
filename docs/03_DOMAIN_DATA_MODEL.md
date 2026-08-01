# Domain and Data Model

## 1. Aggregate utama

### Organization

Mewakili pemilik proyek. Pada MVP hanya satu organization, tetapi struktur mendukung lebih dari satu.

### Site

Lokasi implementasi, misalnya SMAN 17 Bandar Lampung.

### MonitoringPoint

Titik fisik pemantauan di dalam site. Device dapat diganti tanpa menghilangkan identitas titik dan histori lokasi.

### Device

Perangkat IoT yang mengirim telemetry. API resource memiliki opaque internal `id`, sedangkan
`hardwareId` adalah identifier publik yang unik global dan immutable. Lifecycle Phase 02 hanya
`ENABLED` dan `DISABLED`. Satu monitoring point memiliki maksimal satu enabled device.

### Telemetry

Data mentah dan ter-normalisasi yang dikirim perangkat. Bersifat append-only.

### ThresholdProfile

Versi aturan evaluasi risiko. Hanya satu profile aktif per site pada satu waktu.

### RiskAssessment

Hasil evaluasi server untuk satu telemetry menggunakan satu threshold profile.

### Alert

Insiden atau kondisi yang perlu perhatian operator.

### AlertEvent

Histori transisi dan catatan pada alert.

### AuditLog

Catatan aksi sensitif pada sistem.

## 2. Invariant penting

- `device.hardwareId` unik global.
- `(deviceId, messageId)` unik sebagai primary idempotency key.
- `(deviceId, bootId, sequence)` unik. `bootId` wajib berubah setiap boot dan tetap sama selama satu
  boot session; sequence tidak boleh diberi uniqueness global lintas boot.
- Telemetry tidak boleh diubah oleh pengguna biasa.
- RiskAssessment memiliki referensi ke profile yang digunakan.
- Alert transition harus menghasilkan AlertEvent.
- Satu dedupKey hanya memiliki satu active alert.
- School Admin tidak boleh mengaktifkan threshold profile.
- Device disabled tidak boleh menerima telemetry sukses.
- Credential mentah hanya boleh dikembalikan sekali saat register/rotate; persistence hanya
  menyimpan hash dan secret lama invalid segera setelah rotation.
- Raw telemetry tidak menyimpan Authorization header atau credential.
- Device organization diturunkan dari device yang berhasil diautentikasi, bukan dari body
  telemetry.
- Monitoring point tanpa data segar berstatus UNKNOWN.

## 3. Status domain

### RiskLevel

- `SAFE`
- `WATCH`
- `DANGER`
- `UNKNOWN`

### DeviceLifecycleStatus (Phase 02)

- `ENABLED`
- `DISABLED`

Konektivitas (`ONLINE`, `DELAYED`, `OFFLINE`) dan maintenance adalah konsep terpisah yang belum
diimplementasikan pada Phase 02 dan tidak boleh dimasukkan ke lifecycle.

### AlertStatus

- `ACTIVE`
- `ACKNOWLEDGED`
- `RESOLVED`
- `FALSE_ALARM`

`ACTIVE` dan `ACKNOWLEDGED` adalah unresolved. `RESOLVED` dan `FALSE_ALARM` adalah terminal dan
tidak dapat dibuka kembali. Transisi yang valid hanya:

- `ACTIVE -> ACKNOWLEDGED`;
- `ACTIVE -> FALSE_ALARM`;
- `ACKNOWLEDGED -> RESOLVED`;
- `ACKNOWLEDGED -> FALSE_ALARM`.

Observasi baru pada alert `ACKNOWLEDGED` memperbarui observasi tanpa mengembalikan status ke
`ACTIVE`. Kondisi baru setelah alert terminal membuat alert `ACTIVE` baru dengan deduplication key
baru. Setiap perubahan lifecycle menghasilkan tepat satu `AlertEvent` immutable dan satu
`AuditLog` tersanitasi dalam transaksi yang sama dengan perubahan Alert.

### Role

- `PROJECT_OWNER`
- `SCHOOL_ADMIN`

## 4. Data retention awal

Rekomendasi MVP:

- Raw telemetry: minimal 12 bulan.
- Agregasi per jam: dipertahankan lebih lama.
- Alert, alert events, audit log: tidak dihapus otomatis selama proyek aktif.
- Login/security logs: 90–180 hari sesuai kapasitas.
- File report hasil generate: 90 hari, dapat dibuat ulang.

Retensi final perlu disesuaikan dengan kebijakan institusi.

## 5. Index penting

- Telemetry: `(deviceId, deviceTimestamp DESC)`.
- Telemetry: `(receivedAt DESC)`.
- Telemetry unique: `(deviceId, messageId)`.
- Telemetry unique: `(deviceId, bootId, sequence)`.
- RiskAssessment: `(monitoringPointId, evaluatedAt DESC)`.
- Alert: `(siteId, status, openedAt DESC)`.
- Device: `(monitoringPointId, lifecycleStatus)` untuk menegakkan maksimal satu enabled device.
- AuditLog: `(organizationId, createdAt DESC)`.

## 6. Skema awal

Source of truth schema aktif berada di `apps/api/prisma/schema.prisma` dan dikembangkan secara
bertahap sesuai fase. `backend/prisma/schema.prisma` hanya referensi domain lama/deprecated dan
tidak boleh digunakan sebagai schema aktif atau sumber migration.

## 7. Implementasi persistence Phase 02

- Composite foreign key menegakkan konsistensi Organization, Site, MonitoringPoint, dan Device.
- Partial unique index PostgreSQL menegakkan maksimal satu Device `ENABLED` per MonitoringPoint;
  Device `DISABLED` tetap tersedia sebagai histori.
- Device hanya menyimpan `credentialHash` dan waktu rotasi. Tidak ada kolom raw credential.
- Sensor telemetry menggunakan Decimal, sequence menggunakan BigInt, dan timestamp domain baru
  menggunakan `timestamptz(3)`.
- Telemetry tidak memiliki `updatedAt`, seluruh foreign key historinya memakai delete restriction,
  dan raw payload mendapat defense-in-depth constraint untuk menolak property credential/header.
- `serverReceivedAt` juga menjadi waktu pembuatan row telemetry sehingga tidak ditambahkan
  `createdAt` yang redundan.
