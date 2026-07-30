# Migration Note — Phase 01 Auth Session Rotation

Migration: `20260730090000_refresh_session_rotation_link`

## Scope

Migration ini menambahkan self-referencing foreign key dan unique constraint pada
`RefreshSession.replacedById`. Satu refresh session lama hanya dapat menunjuk satu session pengganti,
dan ID pengganti tidak dapat menunjuk row yang tidak ada.

Tidak ada model baru.

## Compatibility and recovery

Migration aman untuk tabel kosong maupun row lama yang memiliki `replacedById = NULL`. Sebelum
deployment ke database yang telah memiliki session, pastikan tidak ada duplicate/nonexistent
`replacedById`.

Rollback memerlukan penghapusan constraint `RefreshSession_replacedById_fkey`, lalu index
`RefreshSession_replacedById_key`. Jangan melakukan rollback ketika application version baru masih
menjalankan refresh rotation.
