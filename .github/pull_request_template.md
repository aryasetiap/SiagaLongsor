## Scope

<!-- Jelaskan satu tujuan PR dan hal yang sengaja tidak dikerjakan. -->

## Type

- [ ] Backend
- [ ] Frontend
- [ ] Contract
- [ ] Shared/tooling
- [ ] Documentation

## Contract impact

- [ ] None
- [ ] Backward compatible
- [ ] Breaking

<!-- Jelaskan endpoint, schema, status code, error, atau compatibility plan yang terdampak. -->

## Database/migration impact

<!-- Tulis "Tidak ada" atau jelaskan schema, migration, recovery, dan migration note. -->

## Security impact

<!-- Tulis "Tidak ada" atau jelaskan authentication, authorization, secret, audit, dan abuse risk. -->

## Shared files changed

<!-- Sebutkan shared file dan koordinasi yang telah dilakukan. -->

## Verification

<!-- Daftar command otomatis dan hasilnya. -->

## Manual verification

<!-- Langkah manual yang dijalankan atau alasan tidak diperlukan. -->

## Screenshots untuk UI

<!-- Lampirkan sebelum/sesudah untuk perubahan UI, atau tulis "Tidak berlaku". -->

## Review and lead bypass

- [ ] Review non-author telah diminta.
- [ ] Tidak menggunakan lead bypass.
- [ ] Menggunakan lead bypass dan alasannya didokumentasikan.

Lead bypass reason:

Verification:

Risk assessment:

## Checklist

- [ ] Branch berasal dari `main` terbaru.
- [ ] PR memiliki satu tujuan.
- [ ] OpenAPI diperbarui bila kontrak berubah.
- [ ] Migration note tersedia bila database berubah.
- [ ] Environment template dan README diperbarui bila diperlukan.
- [ ] Test relevan ditambahkan atau alasan pengecualian dijelaskan.
- [ ] Full monorepo verification lulus.
- [ ] Tidak ada secret, credential, token, atau local environment file dalam perubahan.
- [ ] Perubahan contract/shared telah direview developer dari area lain.
