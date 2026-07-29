# Security and Operations

## 1. Threat model ringkas

Aset utama:

- Device credential.
- User credential.
- Telemetry dan histori kejadian.
- Threshold configuration.
- Alert lifecycle.
- Peta dan SOP.

Ancaman:

- Device palsu mengirim data.
- Replay payload lama.
- Credential bocor.
- User sekolah mengubah threshold tanpa hak.
- Data telemetry dihapus atau dimanipulasi.
- Alert diselesaikan tanpa catatan.
- Service outage.
- Internet lapangan putus.
- Clock device salah.

## 2. Authentication

### User

- Password hash Argon2id atau bcrypt dengan konfigurasi kuat.
- Session cookie httpOnly secure atau access/refresh token dengan rotasi.
- Rate limit login.
- Lockout bertahap, bukan permanen otomatis.
- MFA disiapkan untuk Project Owner pada fase berikutnya.

### Device

- Secret unik per device.
- Secret hanya ditampilkan sekali.
- Database menyimpan hash, bukan plaintext.
- Credential dapat dirotasi dan direvoke.
- Device ID bukan secret.
- Pertimbangkan HMAC signature pada fase hardening.

## 3. Authorization

Backend wajib memeriksa organization/site membership.

School Admin:

- Tidak dapat aktivasi threshold.
- Tidak dapat rotate device credential.
- Tidak dapat mengubah user menjadi Project Owner.
- Tidak dapat menghapus log.

## 4. Ingestion protections

- JSON body size limit.
- Schema validation ketat.
- Rate limit per device.
- Timestamp tolerance configurable.
- Sequence and message id checks.
- Payload hash untuk mendeteksi conflict.
- Request ID dan structured logs.
- Device disabled menghasilkan 403.

## 5. Audit log

Aksi minimum:

- User login/logout penting.
- Invite/disable/change role.
- Device create/disable/credential rotate.
- Threshold create/activate.
- Alert acknowledge/resolve/false alarm.
- Map/SOP update.
- Maintenance start/end.

Audit log menyimpan:

- Actor.
- Action.
- Entity.
- Before/after yang disanitasi.
- Timestamp.
- IP dan user agent bila tersedia.
- Request ID.

Jangan menyimpan secret pada before/after.

## 6. Backup

Minimum:

- PostgreSQL backup harian.
- Retensi harian 7–14 hari dan mingguan 4–8 minggu.
- Backup disimpan di lokasi berbeda dari VPS utama.
- Uji restore minimal bulanan saat tahap produksi awal.
- Dokumentasikan RPO/RTO.

Target awal:

- RPO <= 24 jam.
- RTO <= 4 jam.

## 7. Monitoring

- API health endpoint.
- Database connectivity.
- Redis connectivity.
- Queue backlog.
- Telemetry count per device.
- Last telemetry age.
- Error rate.
- p95 latency.
- Disk usage.
- Backup success.

## 8. Incident handling

### Device offline

1. Dashboard mengubah status ke UNKNOWN.
2. Alert dibuat.
3. School Admin memeriksa listrik/koneksi fisik.
4. Project Owner memeriksa server dan credential.
5. Catat tindakan pada alert.

### Server outage

1. Sirene lokal tetap berfungsi.
2. Device buffer data.
3. Setelah server pulih, retry idempotent.
4. Operator memeriksa gap telemetry.

### Credential suspected leak

1. Disable credential lama.
2. Generate credential baru.
3. Provision ulang device.
4. Audit telemetry mencurigakan.
5. Dokumentasikan insiden.

## 9. Production checklist

- HTTPS aktif.
- Database/Redis tidak publik.
- Secret production berbeda dari development.
- CORS ketat.
- CSP frontend.
- Backup dan restore diuji.
- Seed account default dihapus.
- Rate limit diuji.
- Audit log diuji.
- Permission matrix diuji.
- Offline simulation diuji.
