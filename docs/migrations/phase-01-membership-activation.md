# Migration Note — Phase 01 Membership Activation

Migration: `20260730100000_membership_activation`

## Scope

Migration menambahkan `Membership.isActive` dengan default `true`. Authorization hanya memuat
membership aktif sehingga akses organization dapat dicabut tanpa menghapus histori relasi user.

## Compatibility and recovery

Existing membership tetap aktif setelah migration. Rollback dapat menghapus kolom `isActive`, tetapi
application version yang memfilter kolom tersebut harus dihentikan lebih dahulu.
