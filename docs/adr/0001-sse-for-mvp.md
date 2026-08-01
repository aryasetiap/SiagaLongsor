# ADR-0001: Server-Sent Events untuk Realtime MVP

- Status: Accepted
- Tanggal: 2026-07-29
- Diperjelas: 2026-08-01 (kontrak Phase 05)

## Konteks

Dashboard terutama menerima pembaruan satu arah dari server. Client juga harus dapat memulihkan
state setelah koneksi terputus dan harus membawa bearer token serta konteks organisasi tanpa
menempatkan token pada URL.

## Keputusan

Gunakan SSE untuk pembaruan realtime MVP. REST tetap menjadi sumber authoritative dan client wajib
melakukan refetch setelah reconnect.

- Client memakai fetch-based streaming agar bearer token dan `X-Organization-Id` berada pada
  header; token query parameter dilarang.
- SSE hanya notification/invalidation dan bukan authoritative state, durable log, exactly-once
  transport, atau replay channel. `Last-Event-ID` hanya observability hint.
- Server mengirim keepalive comment setiap 15 detik. Client reconnect dengan jittered backoff
  1/2/5/10/30 detik (maksimum), lalu refetch REST.
- Logout, invalid session, refresh failure, dan organization switch menutup stream lama.
- Redis Pub/Sub menyediakan fan-out multi-instance. Publish terjadi setelah commit; kegagalan
  publish tidak me-rollback perubahan domain.

## Konsekuensi

- Implementasi lebih sederhana daripada koneksi dua arah.
- Infrastruktur harus menangani koneksi HTTP berumur panjang.
- Redis Pub/Sub bersifat best-effort sehingga event yang hilang dipulihkan melalui refetch REST.
- Operasional harus mengatur timeout proxy, buffering off, connection limits, dan graceful shutdown.
