# Team Workflow

## 1. Tujuan

Dokumen ini mengatur kerja paralel dua developer SiagaLongsor agar perubahan backend dan frontend
tetap kompatibel, mudah ditinjau, dan tidak menurunkan safety maupun security. `CONTRIBUTING.md`
menjadi panduan operasional ringkas; dokumen ini menjelaskan ownership, koordinasi, dan checkpoint
integrasi secara rinci.

## 2. Struktur tim dan ownership

### Backend Engineer

Arya Setia Pratama (`@aryasetiap`) menjadi pemilik utama:

- `apps/api/**` dan `apps/api/prisma/**`;
- NestJS controller, service, guard, dan domain logic;
- PostgreSQL, migration, seed, dan migration note;
- authentication dan security API;
- device ingestion dan simulator;
- `specs/openapi.yaml` sebagai implementor utama;
- API integration test.

### Frontend Engineer

Frontend Engineer (`@habibzzzzzz`) menjadi pemilik utama:

- `apps/web/**`;
- Next.js routes, UI/UX, accessibility, dan frontend state;
- frontend API integration dan public environment;
- loading, error, dan empty states;
- component test dan browser/E2E test.

### Shared ownership

Area berikut memerlukan koordinasi dan review silang:

- root `package.json`, `pnpm-lock.yaml`, dan `pnpm-workspace.yaml`;
- `.github/**`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, dan dokumen workflow;
- API contract, `specs/**`, contract fixtures, roadmap, dan acceptance plan;
- shared packages dan generated API contract types;
- `compose.yaml` dan root environment template.

Developer yang akan mengubah shared file harus memberi shared-file notice kepada developer lain
sebelum mulai. Satu developer menjadi editor pada satu waktu; developer lain menjadi reviewer.
Primary ownership menunjukkan keahlian utama, bukan pengecualian dari kewajiban cross-review.

## 3. Branch dan review

- Branch dibuat dari `main` terbaru dan berumur pendek.
- Satu branch hanya digunakan satu developer.
- Satu PR memiliki satu tujuan dan tidak mencampur perubahan yang tidak berkaitan.
- Semua perubahan tetap melalui pull request.
- PR contract digabung sebelum PR backend atau frontend yang bergantung padanya.
- PR besar dipecah berdasarkan capability, security boundary, atau checkpoint integrasi.
- Review non-author adalah normal workflow: PR Habib direview Arya dan PR Arya secara normal
  meminta review Habib.
- Author tidak dapat meng-approve PR miliknya sendiri; lead bypass bukan self-approval.
- Backend PR direview FE untuk contract atau public behavior, sedangkan frontend PR direview BE
  untuk API, authentication, dan security integration.
- Contract/shared/security changes secara normal mendapat cross-review.
- Seluruh conversation harus resolved dan CI wajib lulus.
- Squash merge digunakan sebagai default dan branch dihapus setelah merge.
- Push langsung atau force-push ke `main` dilarang.
- CODEOWNERS digunakan untuk ownership documentation, area expertise, dan automatic review
  routing; primary ownership tetap mengikuti dokumen ini.
- Required CODEOWNER review belum diaktifkan dan baru dievaluasi kembali setelah workflow dua
  developer stabil serta tidak menimbulkan deadlock.

### Documented Team Lead bypass

Arya sebagai Team Lead dan repository owner dapat memakai lead/admin bypass bila ruleset GitHub
mengizinkan dan salah satu kondisi berikut berlaku:

- perubahan hanya documentation atau chore berisiko rendah;
- reviewer sedang tidak tersedia;
- perbaikan mendesak diperlukan.

Sebelum bypass, seluruh CI dan verification harus lulus serta scope dan risiko harus diperiksa.
Lead bypass bukan approval dan tidak boleh disebut sebagai approval. Arya wajib menulis komentar
PR yang memuat:

- alasan bypass;
- scope perubahan;
- hasil verification;
- risiko yang diperiksa;
- alasan perubahan tetap aman untuk digabung.

Lead bypass bukan workflow normal untuk authentication, authorization, security boundary, API
contract, Prisma schema, migration, telemetry authentication, credential handling, atau CI/shared
infrastructure berisiko tinggi. Perubahan tersebut secara normal tetap membutuhkan cross-review.
Emergency hanya dapat menjadi pengecualian bila alasan, risiko, dan keputusan merge dijelaskan
secara tertulis.

## 4. Contract-first workflow

OpenAPI adalah source of truth kontrak HTTP. Backend Engineer menjadi implementor utama dan
Frontend Engineer wajib mereview perubahan yang dipakai web.

1. Sepakati kebutuhan endpoint, permission, scope, pagination, status code, dan error envelope.
2. Perbarui OpenAPI melalui contract PR.
3. BE dan FE meninjau request, response, error, status code, security, nullable field, dan example.
4. Gabungkan contract PR.
5. BE mengimplementasikan endpoint serta API integration test.
6. FE mengembangkan menggunakan typed mock dan fixture yang sesuai kontrak.
7. Verifikasi mock terhadap API aktual.
8. Jalankan contract dan browser integration smoke test.

Perubahan dianggap breaking bila menghapus atau mengganti nama field, mengubah tipe, menjadikan
field optional sebagai required, mempersempit enum, atau mengubah path, method, status code,
pagination, authentication, maupun authorization semantics. Breaking change memerlukan rencana
compatibility; jangan mengganti contract yang telah dipakai secara diam-diam.

Frontend dan backend dilarang memelihara tipe API buatan sendiri yang berbeda. Setelah kontrak
Phase 02 disepakati, tooling PR terpisah akan membuat `packages/api-contract` menggunakan versi
exact `openapi-typescript`. OpenAPI tetap source of truth dan generated output tidak boleh diedit
manual.

## 5. Database dan migration

- Hanya Backend Engineer mengubah Prisma schema dan migration.
- Migration dibuat melalui Prisma sebagai default. SQL manual memerlukan alasan tertulis.
- Migration yang sudah masuk `main` tidak boleh diedit, di-rename, atau diurutkan ulang.
- Setiap migration memiliki note di `docs/migrations/**`.
- Migration diuji dari database kosong dan, untuk perubahan berisiko, dari versi sebelumnya.
- Seed harus idempotent dan credential hanya berasal dari environment.
- Frontend tidak boleh bergantung pada data yang hanya tersedia di database developer tertentu.
- Generated Prisma Client tidak dilacak dan tidak boleh diselesaikan melalui edit manual.

Jika FE membutuhkan field baru, perubahan dimulai dari contract task. FE dapat memakai typed mock
setelah contract digabung, sedangkan BE membuat schema, migration, dan endpoint. FE tidak boleh
menganggap field tersedia pada API aktual sebelum checkpoint integrasi terkait lulus.

## 6. Dependency dan lockfile

- Developer menambah dependency hanya pada package aplikasi yang membutuhkannya.
- Root atau shared dependency memerlukan review silang dan alasan dalam PR.
- `pnpm-lock.yaml` hanya dihasilkan oleh pnpm dan tidak boleh diedit manual.
- Penambahan dependency bersamaan harus dikoordinasikan.

Jika lockfile conflict:

1. Integrasikan `main` terbaru.
2. Selesaikan seluruh `package.json` secara semantik.
3. Pulihkan lockfile dari basis `main` terbaru.
4. Regenerate dengan pnpm.
5. Jalankan install dengan `--frozen-lockfile`.
6. Review bahwa diff lockfile hanya berasal dari manifest yang disepakati.

Jangan menerima seluruh versi `ours` atau `theirs` sebagai penyelesaian akhir tanpa regenerasi.

## 7. Environment

- Root `.env` hanya untuk API, PostgreSQL, authentication, dan seed.
- `apps/web/.env.local` hanya untuk public frontend configuration.
- Local environment tidak dibagikan melalui Git; hanya template `.env.example` yang dilacak.
- Secret development dibagikan melalui kanal aman.
- Password, database URL, server secret, private key, dan token dilarang berada dalam
  `NEXT_PUBLIC_*`.
- Variabel baru harus memperbarui template dan README.
- Perubahan `NEXT_PUBLIC_*` memerlukan restart atau rebuild Next.js.
- FE tidak memerlukan production server credentials dan BE tidak boleh memasukkan server secret
  ke web.

## 8. Testing dan CI

Semua PR ke `main` menjalankan full monorepo verification, termasuk untuk perubahan FE-only atau
BE-only:

- frozen-lockfile install dan Prisma generate;
- format, lint, typecheck, dan unit test;
- API integration test dengan PostgreSQL CI;
- API dan web production build;
- Prisma validation dan migration deploy;
- seed dua kali;
- OpenAPI validation.

CI menggunakan concurrency cancellation untuk membatalkan run lama hanya pada PR atau ref yang
sama. Path-filtered verification belum digunakan.

Playwright Chromium smoke test dibuat melalui PR testing terpisah sebelum frontend management
Phase 02 pertama digabung. Contract drift dan generated-type drift ditambahkan melalui tooling PR
setelah contract Phase 02 disepakati.

## 9. GitHub settings

Pengaturan manual sebelum kerja paralel:

- Frontend Engineer ditambahkan sebagai collaborator dengan permission Write;
- `main` hanya menerima perubahan melalui pull request;
- review non-author digunakan sebagai normal workflow;
- seluruh conversation harus resolved;
- CI harus lulus;
- Team Lead/admin bypass tetap tersedia sesuai aturan documented lead bypass;
- force-push dan branch deletion untuk `main` diblok;
- squash merge dan automatic deletion untuk merged branch diaktifkan.

CODEOWNERS mencantumkan kedua developer pada area kritis untuk routing review dan menunjukkan area
expertise. “Require review from Code Owners” tidak diaktifkan sebagai kebijakan awal dan baru
dievaluasi kembali setelah workflow stabil.

## 10. Phase 02 parallel workstream

Phase 02 tetap organization-scoped. `siteId` menjadi resource relation dan filter, bukan
authorization scope independen.

| Checkpoint | Workstream                                        | Owner   | Output                                                              |
| ---------- | ------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| C1         | Permission matrix, error envelope, dan pagination | Shared  | Aturan lintas endpoint disetujui                                    |
| C2a        | MonitoringPoint contract                          | Shared  | CRUD, filter, response, dan error disetujui                         |
| C2b        | Device dan one-time credential contract           | Shared  | Register, rotate, disable, dan secret-display semantics disetujui   |
| C2c        | Telemetry authentication dan idempotency contract | Shared  | Payload, device auth, duplicate behavior, dan status code disetujui |
| A          | MonitoringPoint integration                       | BE + FE | API aktual menggantikan atau memverifikasi mock UI                  |
| B          | Device integration                                | BE + FE | Device/credential API dan UI lulus smoke test                       |
| C3         | Full contract dan browser integration             | Shared  | Contract validation, API integration, dan Chromium smoke lulus      |

Setelah checkpoint contract:

- **Backend**: Prisma model/migration, MonitoringPoint dan Device endpoint, credential
  hashing/rotation, telemetry authentication dan schema validation, idempotency, raw payload,
  rate limiting, simulator CLI, dan integration test.
- **Frontend**: MonitoringPoint list/detail/form, Device list/detail/register, one-time credential
  display, rotate/disable confirmation, loading/error/empty states, role visibility, typed mocks,
  component test, dan Chromium browser test.
- **Shared**: contract, permission, fixtures, dan acceptance criteria.

## 11. Keputusan Phase 02 yang menunggu contract PR

- Device authentication diarahkan ke
  `Authorization: Device <hardwareId>.<secret>`. `hardwareId` adalah identifier publik, bukan
  internal database ID. Keputusan ini belum mengubah OpenAPI atau runtime.
- Response telemetry Phase 02 tidak memiliki `serverRisk`. Risk engine dimulai pada Phase 03 dan
  Phase 02 tidak mengembalikan placeholder `SAFE` atau `UNKNOWN`.
- `POST /iot/heartbeat` ditunda. Telemetry valid memperbarui konektivitas dasar; heartbeat hanya
  dibuat melalui task terpisah bila kebutuhan lapangan membuktikannya perlu.
- Generated OpenAPI types dan Playwright dibuat melalui PR terpisah sesuai checkpoint di atas.

Out of scope Phase 02: risk engine, alert engine, dashboard KPI, sensor chart, SSE, map, reports,
remote siren, firmware, dan heartbeat.

## 12. Conflict resolution

- **Shared documentation/CI**: hentikan edit paralel, pilih satu editor, lalu review hasil gabungan.
- **OpenAPI/contract**: selesaikan secara semantik oleh BE dan FE; jangan memakai `ours/theirs`
  tanpa review.
- **Lockfile**: selesaikan manifest lalu regenerate dengan pnpm.
- **Prisma/migration**: Backend Engineer melakukan rebase dan membuat migration koreksi baru bila
  migration sebelumnya sudah masuk `main`.
- **Generated output**: regenerate dari source of truth; jangan merge manual.
- **Mock versus API**: OpenAPI menjadi arbiter, kemudian fixture dan implementasi diperbarui.
- **Conflict yang mengubah keputusan produk atau security**: hentikan merge dan minta keputusan
  eksplisit sebelum melanjutkan.
