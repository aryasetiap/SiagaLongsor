# Contributing to SiagaLongsor

SiagaLongsor dikembangkan dengan branch pendek berbasis `main`. Perubahan harus menjaga
correctness, security, auditability, dan kesesuaian kontrak. Aturan teknis tertinggi tetap berada
di `AGENTS.md`; penjelasan workflow yang lebih rinci berada di `docs/12_TEAM_WORKFLOW.md`.

## Ownership

- **Backend Engineer — Arya Setia Pratama (`@aryasetiap`)**: `apps/api/**`,
  `apps/api/prisma/**`, `docs/migrations/**`, NestJS, Prisma/PostgreSQL, migration,
  OpenAPI implementation, backend security, dan API integration test.
- **Frontend Engineer — `@habibzzzzzz`**: `apps/web/**`, Next.js, frontend API integration,
  UI/UX, accessibility, component test, browser/E2E test, dan frontend public environment.
- **Shared ownership**: API contract, `specs/**`, root package/tooling, CI, README, AGENTS,
  workflow documentation, pull request templates, shared packages, dan contract fixtures.

Primary ownership menunjukkan keahlian dan tanggung jawab utama, tetapi tidak menghilangkan
kewajiban cross-review. Perubahan shared atau contract harus diberitahukan kepada developer lain
sebelum dikerjakan.

## Branch dan pull request

Selalu perbarui `main` sebelum membuat branch. Satu branch hanya digunakan oleh satu developer,
dan satu PR harus memiliki satu tujuan yang koheren.

Contoh nama branch:

- `feat/be-monitoring-point-api`
- `feat/fe-monitoring-point-list`
- `contract/phase-02-monitoring-device`
- `fix/be-device-auth`
- `fix/fe-device-form`
- `chore/team-workflow`
- `docs/team-workflow`

Perubahan API mengikuti contract-first workflow: contract PR ditinjau Backend dan Frontend lalu
digabung sebelum implementation PR. Frontend dan backend tidak boleh membuat bentuk kontrak
sendiri-sendiri.

Sebelum merge:

1. Integrasikan `main` terbaru dan selesaikan conflict secara semantik.
2. Pastikan CI lulus dan seluruh conversation resolved.
3. Gunakan normal review flow: PR Habib direview Arya, sedangkan PR Arya meminta review Habib.
4. Minta cross-review untuk contract, shared, security, dan perubahan berisiko tinggi.
5. Gunakan squash merge.
6. Hapus branch setelah merge.

Semua perubahan tetap melalui pull request. Review non-author adalah normal workflow; author tidak
dapat dan tidak boleh dinyatakan meng-approve PR miliknya sendiri.

Arya sebagai Team Lead dan repository owner dapat memakai documented lead/admin bypass bila
ruleset GitHub mengizinkan, reviewer tidak tersedia atau perubahan mendesak, CI sudah hijau, serta
scope dan risiko telah diperiksa. Lead bypass bukan approval. Komentar PR wajib mencatat alasan,
scope, hasil verification, risiko yang diperiksa, dan alasan perubahan aman digabung.

Lead bypass dapat dipakai untuk documentation atau chore berisiko rendah, tetapi bukan workflow
normal untuk authentication, authorization, security boundary, API contract, Prisma schema,
migration, telemetry authentication, credential handling, atau CI/shared infrastructure berisiko
tinggi. Perubahan tersebut secara normal tetap memerlukan cross-review; emergency harus dijelaskan
secara tertulis.

CODEOWNERS digunakan untuk ownership documentation, area expertise, dan automatic review routing;
primary ownership tetap mengikuti dokumen ini. Required CODEOWNER review belum diaktifkan dan baru
dievaluasi kembali setelah workflow dua developer stabil.

Push langsung dan force-push ke `main` dilarang.

## Definition of Done

- Scope dan acceptance criteria terpenuhi.
- Format, lint, typecheck, test relevan, build, Prisma validation, dan OpenAPI validation lulus.
- Permission, loading, error, dan empty state diuji sesuai jenis perubahan.
- OpenAPI diperbarui bila kontrak berubah.
- Migration dan migration note tersedia bila database berubah.
- Template environment dan README diperbarui bila setup berubah.
- Tidak ada secret, credential, token, atau local environment file dalam perubahan.
- Tidak ada generated file yang diedit manual.

Gunakan checklist pada pull request template dan aturan lebih rinci di
`docs/12_TEAM_WORKFLOW.md`.
