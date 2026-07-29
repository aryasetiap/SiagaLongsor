# ADR-0004: Access JWT dan Rotating Refresh Token

- Status: Accepted
- Tanggal: 2026-07-29

## Konteks

MVP membutuhkan login yang dapat dicabut, tidak menyimpan token plaintext, dan dapat mengaudit
session lifecycle.

## Keputusan

- Gunakan access JWT berumur pendek.
- Gunakan rotating refresh token dalam cookie `httpOnly`, `SameSite=Lax`, dan `Secure` di production.
- Simpan hanya hash refresh token di `RefreshSession`.
- Gunakan Argon2id untuk password.
- Terapkan rate limit login serta revocation server-side.

## Konsekuensi

- Refresh token yang dicuri dapat dicabut per session family.
- Endpoint dan guard authentication baru dikerjakan pada Task 03.
- Metadata session tidak boleh berisi token atau password.
