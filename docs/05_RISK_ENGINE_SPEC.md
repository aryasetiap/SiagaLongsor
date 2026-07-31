# Risk Engine and Alert Specification

## 1. Tujuan dan batas keselamatan

Risk engine Phase 03 mengubah telemetry tervalidasi menjadi `RiskAssessment` server-side yang
deterministik, immutable, dapat diaudit, dan terpisah dari assessment firmware. Current
MonitoringPoint state adalah projection dari assessment dan connectivity terbaru; projection ini
tidak menggantikan histori.

Threshold version 1 bersifat **PROVISIONAL**. Angka tersebut berasal dari rancangan awal dan wajib
dikalibrasi bersama ahli yang kompeten serta data lapangan sebelum dianggap threshold bencana
final. Sirene dan evaluasi lokal perangkat tetap independen. Server tidak menyediakan remote
siren.

## 2. Risk level dan urutan evaluasi

Risk level hanya:

- `SAFE`
- `WATCH`
- `DANGER`
- `UNKNOWN`

Urutan evaluasi wajib:

1. Data tidak dapat dievaluasi live menghasilkan `UNKNOWN`.
2. Rule `DANGER` dievaluasi.
3. Seluruh rule `SAFE` dievaluasi.
4. Data valid lainnya menghasilkan `WATCH`.

```ts
if (!hasValidRequiredSensors || !isLiveTrustedState || !hasValidProfile) return 'UNKNOWN';
if (dangerRuleMatched) return 'DANGER';
if (safeRuleMatched) return 'SAFE';
return 'WATCH';
```

### Profile provisional version 1

`SAFE` hanya bila seluruh kondisi berikut benar:

- `tiltMagnitudeDeg < 3`
- `soilMoisturePct < 65`
- `rainfallMmHour < 20`

`DANGER` bila salah satu kondisi berikut benar:

- `tiltMagnitudeDeg > 8`; atau
- `rainfallMmHour > 50` dan `soilMoisturePct > 85`.

Data valid yang tidak memenuhi seluruh kondisi `SAFE` dan tidak memenuhi `DANGER` menjadi
`WATCH`. Karena operator perbandingan bersifat strict, nilai tepat 3, 65, 20, 8, 50, dan 85 harus
diuji eksplisit.

`UNKNOWN` berlaku bila:

- required sensor hilang atau invalid;
- Device `DISABLED`;
- connectivity `DELAYED` atau `OFFLINE`;
- timestamp tidak dapat dipercaya;
- evaluation tidak memiliki active profile yang valid.

Device tanpa active Device atau tanpa telemetry memiliki connectivity dan risk `UNKNOWN`.

## 3. Technical sensor ranges

Technical ranges adalah validasi kualitas data, bukan threshold bencana:

- `tiltXDeg`, `tiltYDeg`: -180 sampai 180;
- `tiltMagnitudeDeg`: 0 sampai 180;
- `soilMoisturePct`: 0 sampai 100;
- `rainfallMmHour`: minimum 0; maximum tetap nullable sampai batas sensor terkalibrasi tersedia;
- `batteryVoltage`: 0 sampai 30;
- `signalRssi`: -150 sampai 0.

Required input risk adalah `tiltMagnitudeDeg`, `soilMoisturePct`, dan `rainfallMmHour`. Input
required yang hilang atau keluar technical range menghasilkan `UNKNOWN`, bukan `SAFE`. Technical
range disimpan dalam profile agar versioned dan auditable.

## 4. Connectivity dan freshness

Connectivity memakai server receipt/latest newly accepted telemetry state, bukan timestamp late
telemetry:

- `ONLINE`: umur last accepted telemetry `<= 20` menit;
- `DELAYED`: umur `> 20` dan `<= 35` menit;
- `OFFLINE`: umur `> 35` menit;
- Device `DISABLED`: `UNKNOWN` dengan reason `DEVICE_DISABLED`.

`DELAYED` dan `OFFLINE` selalu membuat current server risk `UNKNOWN`. Late telemetry yang tidak
memajukan latest accepted Device state tidak dapat memulihkan connectivity. `MAINTENANCE` tetap
deferred karena lifecycle Device Phase 02 hanya `ENABLED` dan `DISABLED`.

## 5. Hysteresis

Default profile:

```json
{
  "watchConsecutiveSamples": 2,
  "dangerConsecutiveSamples": 1,
  "downgradeStableMinutes": 10,
  "mismatchConsecutiveSamples": 3,
  "onlineWithinMinutes": 20,
  "offlineAfterMinutes": 35
}
```

Aturan:

- upgrade ke `DANGER` dapat terjadi setelah satu current valid sample;
- upgrade ke `WATCH` membutuhkan dua current valid samples berurutan;
- downgrade membutuhkan kandidat kondisi yang stabil selama 10 menit;
- kandidat downgrade tidak langsung mengubah risk alert;
- downgrade current risk tidak me-resolve alert;
- late dan exact duplicate telemetry tidak memengaruhi counter hysteresis;
- mismatch firmware/server membutuhkan tiga current samples berurutan sebelum alert dibuat.

Counter berurutan terikat pada MonitoringPoint, Device aktif, dan active profile version. Pergantian
Device atau profile mereset counter prospective tanpa mengubah assessment/alert lama.

## 6. Versioned Site risk profile

Risk profile:

- organization-scoped melalui Site;
- mempunyai opaque immutable `id` dan integer `version`;
- hanya satu active version per Site;
- version lama tidak boleh diedit atau dihapus fisik;
- perubahan berbeda membuat version berikutnya dan mengaktifkannya secara atomik;
- request PUT yang canonically identik adalah no-op dengan `changed: false`;
- perubahan profile tidak menghitung ulang atau mengubah assessment lama;
- setiap assessment menyimpan `profileId` dan `profileVersion`;
- `calibrationStatus` hanya `PROVISIONAL` atau `CALIBRATED`;
- activation dan perubahan profile wajib diaudit pada implementation phase.

Canonical equality mencakup calibration status, thresholds, technical ranges, freshness,
hysteresis, dan normalized nullable notes. Reprocessing histori, bila kelak dibutuhkan, harus
menjadi job/version hasil terpisah.

Profile validation wajib memastikan minimum technical range lebih kecil dari maximum non-null,
SAFE threshold lebih rendah dari pasangan DANGER threshold, `onlineWithinMinutes` lebih kecil dari
`offlineAfterMinutes`, serta seluruh counter/durasi berada pada range schema. Concurrent PUT harus
diserialisasi per Site: configuration berbeda mendapat version berurutan; request identik yang
menemukan configuration sudah aktif menjadi no-op. Contract tidak memakai client-supplied version
atau `If-Match`.

## 7. Telemetry evaluation

- Telemetry baru menghasilkan paling banyak satu assessment yang unik terhadap `telemetryId`.
- Exact duplicate tidak membuat assessment dan tidak memperbarui alert/counter.
- Assessment menyimpan `serverRisk`, reasons, `evaluatedAt`, profile ID/version, firmware risk,
  firmware siren state, dan `affectsCurrentState`.
- Firmware risk adalah pembanding, bukan sumber server risk.
- Perbedaan firmware/server menambahkan reason `DEVICE_SERVER_MISMATCH`.
- Mismatch alert baru dibuat setelah `mismatchConsecutiveSamples` current samples.
- Telemetry late boleh memiliki historical assessment dengan `affectsCurrentState: false`.
- Historical late assessment tidak mengubah current state, hysteresis, connectivity, atau alert.
- Hanya telemetry yang memajukan latest accepted Device state dapat memengaruhi projection dan
  alert.
- Telemetry acknowledgement Phase 02 tetap tidak mengandung `serverRisk`.

Evaluation dan persistence assessment harus idempotent dan transactional pada implementation
phase. Risk engine core harus pure dan tidak bergantung pada database, HTTP, scheduler, atau UI.

## 8. Current MonitoringPoint state

Current state minimal memuat:

- `monitoringPointId`;
- nullable `deviceId`;
- `serverRisk`;
- `connectivityStatus`;
- reasons;
- nullable `latestTelemetryId`;
- `evaluatedAt`;
- nullable `lastTelemetryAt`;
- nullable profile ID/version bila belum tersedia;
- active alert summary.

Projection hanya berubah melalui newly accepted current telemetry, Device lifecycle/assignment,
profile activation, atau connectivity scheduler. Pembacaan projection tidak boleh menghitung state
berbeda per browser request.

Active alert summary menghitung status unresolved (`ACTIVE` dan, setelah Phase 05,
`ACKNOWLEDGED`). `RESOLVED` dan `FALSE_ALARM` tidak dihitung.

## 9. Alert domain

Alert type Phase 03:

- `RISK_WATCH`
- `RISK_DANGER`
- `DEVICE_DELAYED`
- `DEVICE_OFFLINE`
- `DEVICE_SERVER_MISMATCH`

Severity default:

| Type                     | Severity   |
| ------------------------ | ---------- |
| `RISK_WATCH`             | `WARNING`  |
| `RISK_DANGER`            | `CRITICAL` |
| `DEVICE_DELAYED`         | `WARNING`  |
| `DEVICE_OFFLINE`         | `CRITICAL` |
| `DEVICE_SERVER_MISMATCH` | `WARNING`  |

Status disiapkan sebagai `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`, dan `FALSE_ALARM`, tetapi Phase 03
hanya membuat `ACTIVE` dan menyediakan read API. Mutation acknowledge, resolve, dan false-alarm
tetap Phase 05.

Deduplication key secara konseptual adalah
`organizationId/siteId/monitoringPointId/type/unresolved`. Hanya satu unresolved alert untuk key
tersebut. Repeated current observation:

- tidak membuat Alert row baru;
- memperbarui `lastObservedAt`;
- menambah `occurrenceCount` tepat satu;
- mempertahankan `firstObservedAt`.

`RISK_WATCH` dan `RISK_DANGER` adalah key berbeda. Risk downgrade dan connectivity recovery
memperbarui current state, tetapi tidak auto-resolve alert. Late atau duplicate telemetry tidak
membuat/memperbarui alert. Semua perubahan lifecycle alert, termasuk creation pada Phase 03, wajib
menghasilkan event dan audit.

Pembuatan Alert Phase 03 adalah lifecycle transition dan wajib membuat immutable creation event
serta AuditLog dalam transaction yang sama. Deduplicated observation yang hanya menambah
`occurrenceCount` bukan status transition, tetapi waktu/count tetap harus auditable melalui event
observation atau histori setara. Phase 03 belum mengekspos event tersebut melalui HTTP.

## 10. Background connectivity evaluator

Scheduler:

- berjalan default setiap 5 menit;
- memakai distributed lock sehingga hanya satu evaluator efektif;
- idempotent untuk evaluation timestamp/state yang sama;
- mengevaluasi setiap Device `ENABLED`, termasuk ketika tidak ada browser aktif;
- memakai last newly accepted server receipt state;
- mengubah connectivity/risk menjadi `DELAYED`/`OFFLINE` dan `UNKNOWN` sesuai boundary;
- menghasilkan atau memperbarui deduplicated connectivity alert;
- tidak auto-resolve alert ketika recovery;
- tidak mengirim notification eksternal pada Phase 03;
- tidak memiliki HTTP trigger endpoint.

## 11. Minimum test matrix

- Semua nilai di bawah SAFE.
- Boundary tepat 3, 65, 20, 8, 50, dan 85.
- Tilt di atas 8.
- Rain di atas 50 dengan moisture tepat 85 dan di atas 85.
- Gap moisture 65–70 serta rain di atas 50 tanpa moisture di atas 85.
- Missing/invalid required sensor.
- Profile tidak tersedia/invalid.
- Device disabled, delayed, offline, dan timestamp untrusted.
- DANGER precedence.
- WATCH dua sample; DANGER satu sample.
- Downgrade stability.
- Exact duplicate dan concurrent evaluation.
- Late assessment `affectsCurrentState: false`.
- Profile version berbeda dan histori tetap.
- Firmware mismatch tiga sample.
- Alert deduplication dan occurrence count.
- Scheduler boundary 20/35 menit, lock, dan idempotency.
- Cross-organization read isolation dan permission profile PUT.

## 12. Keputusan yang belum diselesaikan

- Governance dan bukti ahli yang wajib dipenuhi sebelum PROJECT_OWNER boleh menetapkan
  `calibrationStatus: CALIBRATED`.
- Cadence produksi dapat dibuat configurable, tetapi contract Phase 03 hanya membekukan default
  lima menit dan tidak menambah environment variable.
- Retention/archival jangka panjang untuk RiskAssessment dan Alert history ditetapkan sebelum
  produksi; physical delete melalui alur normal tetap dilarang.
