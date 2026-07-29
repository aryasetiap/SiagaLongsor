# ADR-0001: Server-Sent Events untuk Realtime MVP

- Status: Accepted
- Tanggal: 2026-07-29

## Konteks

Dashboard terutama menerima pembaruan satu arah dari server. Client juga harus dapat memulihkan
state setelah koneksi terputus.

## Keputusan

Gunakan SSE untuk pembaruan realtime MVP. REST tetap menjadi sumber pemulihan state dan client
wajib melakukan refetch setelah reconnect.

## Konsekuensi

- Implementasi lebih sederhana daripada koneksi dua arah.
- Infrastruktur harus menangani koneksi HTTP berumur panjang.
- SSE belum diimplementasikan pada checkpoint Phase 01 Task 01–02.
