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
- Access JWT menyimpan `userId` dan `sessionId`; guard memeriksa session serta membership terbaru
  pada database untuk setiap request.
- Refresh token menggunakan 32 byte random entropy dan hash SHA-256. Rotasi membentuk session family;
  reuse atau rotasi konkuren mencabut seluruh family.
- Rate-limit login memakai storage in-memory untuk deployment API tunggal pada MVP. Shared storage
  diperlukan sebelum horizontal scaling.

## Konsekuensi

- Refresh token yang dicuri dapat dicabut per session family.
- Setiap request terproteksi menambah query session/membership; ini dipilih agar logout, disable user,
  dan perubahan role berlaku segera.
- Metadata session tidak boleh berisi token atau password.
