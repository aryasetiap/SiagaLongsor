# Security and Operations

> Historical security planning record. For current deployment operation and the accepted research-release limitations, use [Production Deployment and Operations](28_PRODUCTION_DEPLOYMENT_OPERATIONS.md) and [R10 Final Acceptance](27_R10_FINAL_ACCEPTANCE_REPORT.md). Items concerning Alerts, Map/SOP, queues, backup targets, or multi-instance operation are not claims of current final-product capability.

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

- Password di-hash dengan Argon2id.
- Access JWT berumur pendek dan terikat pada server-side refresh session.
- Refresh token opaque 256-bit, single-use, dan hanya hash SHA-256 yang disimpan.
- Refresh token dikirim melalui cookie `httpOnly`, `SameSite=Lax`, dan `Secure` pada production.
- Endpoint refresh dan logout menolak header `Origin` yang tidak sama dengan `WEB_URL`. Request tanpa
  header `Origin` diizinkan untuk development CLI dan integrasi server-to-server; browser tetap
  dilindungi oleh pemeriksaan Origin eksplisit dan cookie `SameSite=Lax`. Reverse proxy tidak boleh
  menghapus atau menulis ulang header `Origin` browser.
- Reuse refresh token mencabut seluruh session family.
- Logout mencabut session family di server sehingga access JWT terkait langsung ditolak.
- Rate limit login diterapkan per source IP. Penyimpanan counter saat ini in-memory dan harus
  dipindahkan ke shared store sebelum menjalankan banyak instance API.
- Di belakang reverse proxy, set `API_TRUST_PROXY_HOPS` ke jumlah hop yang tepat agar IP client
  terbaca tanpa mempercayai header forwarding dari sumber langsung.
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

Backend wajib memeriksa organization membership aktif pada setiap request terproteksi. Site scope belum
aktif karena MVP baru memiliki satu site, tetapi organization guard dibuat agar metadata scope dapat
diperluas pada fase berikutnya.

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
- Database tidak publik.
- Secret production berbeda dari development.
- CORS ketat.
- CSP frontend.
- Backup dan restore diuji.
- Seed account default dihapus.
- Rate limit diuji.
- Audit log diuji.
- Permission matrix diuji.
- Offline simulation diuji.
