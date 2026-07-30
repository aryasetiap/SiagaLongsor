# Domain and Data Model

## 1. Aggregate utama

### Organization

Mewakili pemilik proyek. Pada MVP hanya satu organization, tetapi struktur mendukung lebih dari satu.

### Site

Lokasi implementasi, misalnya SMAN 17 Bandar Lampung.

### MonitoringPoint

Titik fisik pemantauan di dalam site. Device dapat diganti tanpa menghilangkan identitas titik dan histori lokasi.

### Device

Perangkat IoT yang mengirim telemetry. Satu monitoring point memiliki maksimal satu device aktif pada MVP.

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
- `(deviceId, messageId)` unik.
- `(deviceId, sequence)` unik bila sequence tersedia.
- Telemetry tidak boleh diubah oleh pengguna biasa.
- RiskAssessment memiliki referensi ke profile yang digunakan.
- Alert transition harus menghasilkan AlertEvent.
- Satu dedupKey hanya memiliki satu active alert.
- School Admin tidak boleh mengaktifkan threshold profile.
- Device disabled tidak boleh menerima telemetry sukses.
- Monitoring point tanpa data segar berstatus UNKNOWN.

## 3. Status domain

### RiskLevel

- `SAFE`
- `WATCH`
- `DANGER`
- `UNKNOWN`

### DeviceStatus

- `ONLINE`
- `DELAYED`
- `OFFLINE`
- `MAINTENANCE`
- `DISABLED`

### AlertStatus

- `OPEN`
- `ACKNOWLEDGED`
- `RESOLVED`
- `FALSE_ALARM`

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
- RiskAssessment: `(monitoringPointId, evaluatedAt DESC)`.
- Alert: `(siteId, status, openedAt DESC)`.
- Device: `(siteId, status)`.
- AuditLog: `(organizationId, createdAt DESC)`.

## 6. Skema awal

Source of truth schema aktif berada di `apps/api/prisma/schema.prisma` dan dikembangkan secara
bertahap sesuai fase. `backend/prisma/schema.prisma` hanya referensi domain lama/deprecated dan
tidak boleh digunakan sebagai schema aktif atau sumber migration.
