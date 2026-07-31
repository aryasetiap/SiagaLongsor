'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type { Principal, Role } from '../auth/auth-types';
import { useOrganization } from '../organization/organization-context';
import { BrandMark } from './brand-mark';

interface ApplicationShellProps {
  readonly principal: Principal;
}

interface NavigationItem {
  readonly label: string;
  readonly href?: string;
  readonly roles: readonly Role[];
}

const navigation: readonly NavigationItem[] = [
  {
    label: 'Overview',
    href: '/overview',
    roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
  },
  { label: 'Monitoring', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  { label: 'Peringatan', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  { label: 'Peta & Evakuasi', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  { label: 'Perangkat', roles: ['PROJECT_OWNER'] },
  { label: 'Laporan', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  { label: 'Pengaturan', roles: ['PROJECT_OWNER'] },
];

export function ApplicationShell({ principal }: ApplicationShellProps) {
  const router = useRouter();
  const auth = useAuth();
  const organization = useOrganization();
  const [loggingOut, setLoggingOut] = useState(false);
  const membership = organization.activeMembership;
  const role = membership?.role;
  const visibleNavigation =
    role === undefined
      ? navigation.slice(0, 1)
      : navigation.filter((item) => item.roles.includes(role));

  async function logout(): Promise<void> {
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      router.replace('/login');
    }
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] md:grid md:grid-cols-[260px_1fr]">
      <aside className="border-b border-slate-200 bg-white px-4 py-4 md:min-h-screen md:border-b-0 md:border-r md:px-5 md:py-6">
        <div className="flex items-center justify-between md:block">
          <BrandMark />
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 md:hidden">
            Sesi aktif
          </span>
        </div>

        <nav
          className="mt-5 flex gap-2 overflow-x-auto pb-1 md:mt-10 md:block md:space-y-1"
          aria-label="Navigasi utama"
        >
          {visibleNavigation.map((item) =>
            item.href === undefined ? (
              <button
                key={item.label}
                type="button"
                disabled
                title="Belum tersedia pada fase ini"
                className="shell-nav-item shrink-0 cursor-not-allowed opacity-50"
              >
                <NavigationIcon label={item.label} />
                <span>{item.label}</span>
                <span className="ml-auto hidden text-[10px] font-medium text-slate-400 md:inline">
                  Segera
                </span>
              </button>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="shell-nav-item shell-nav-item-active shrink-0"
                aria-current="page"
              >
                <NavigationIcon label={item.label} />
                <span>{item.label}</span>
              </Link>
            ),
          )}
        </nav>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:mt-8">
          <p className="text-xs font-semibold text-slate-500">Lingkup aktif</p>
          {organization.availableMemberships.length > 1 && (
            <label className="mt-2 block text-xs font-semibold text-slate-600">
              Organisasi aktif
              <select
                value={organization.activeOrganizationId ?? ''}
                onChange={(event) => organization.selectOrganization(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <option value="">Pilih organisasi</option>
                {organization.availableMemberships.map((candidate) => (
                  <option key={candidate.organizationId} value={candidate.organizationId}>
                    {candidate.organizationName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="mt-2 truncate text-sm font-bold text-slate-900">
            {membership?.organizationName ?? 'Belum ada organisasi'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatRole(role)}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-5 py-3 sm:px-8">
          <div>
            <p className="text-xs font-semibold text-slate-500">Ruang kerja</p>
            <h1 className="mt-1 text-lg font-bold text-slate-950">Overview</h1>
          </div>

          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">
                {initials(principal.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-44 truncate text-sm font-bold text-slate-900">
                  {principal.name}
                </span>
                <span className="block text-xs text-slate-500">{formatRole(role)}</span>
              </span>
              <svg
                className="size-4 text-slate-400"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m6 8 4 4 4-4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="border-b border-slate-100 px-2 pb-3">
                <p className="font-bold text-slate-950">{principal.name}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{principal.email}</p>
              </div>
              <div className="my-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                <span className="mr-2 inline-block size-2 rounded-full bg-emerald-500" />
                Sesi aktif dan terverifikasi
              </div>
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void logout()}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-60"
              >
                {loggingOut ? 'Mengakhiri sesi…' : 'Keluar'}
              </button>
            </div>
          </details>
        </header>

        <main className="px-5 py-6 sm:px-8 sm:py-8">
          <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                Fondasi aplikasi
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
                Selamat datang, {firstName(principal.name)}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Sesi Anda aktif. Modul monitoring akan tersedia pada fase berikutnya setelah kontrak
                data dan aturan keselamatan selesai diterapkan.
              </p>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8 xl:grid-cols-3">
              <InformationCard
                label="Pengguna"
                value={principal.name}
                description={principal.email}
              />
              <InformationCard
                label="Organisasi"
                value={membership?.organizationName ?? 'Belum ditetapkan'}
                description="Lingkup akses saat ini"
              />
              <InformationCard
                label="Status sesi"
                value="Aktif"
                description={`${formatRole(role)} · diverifikasi backend`}
                status
              />
            </div>
          </section>

          <section className="mt-6 rounded-[22px] border border-dashed border-slate-300 bg-white/70 p-7 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path
                  d="M5 19V9m7 10V5m7 14v-7"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            </span>
            <h2 className="mt-4 text-base font-bold text-slate-900">
              Overview monitoring belum diaktifkan
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Tidak ada statistik sementara atau data sensor contoh yang ditampilkan. Area ini
              disiapkan untuk implementasi dashboard pada task terpisah.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

function InformationCard({
  label,
  value,
  description,
  status = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly status?: boolean;
}) {
  return (
    <article className="rounded-[18px] border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-3 flex items-center gap-2 truncate text-base font-bold text-slate-950">
        {status && <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />}
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">{description}</p>
    </article>
  );
}

function NavigationIcon({ label }: { readonly label: string }) {
  const firstLetter = label.slice(0, 1);
  return (
    <span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-600">
      {firstLetter}
    </span>
  );
}

function formatRole(role: Role | undefined): string {
  if (role === 'PROJECT_OWNER') return 'Project Owner';
  if (role === 'SCHOOL_ADMIN') return 'Admin Sekolah';
  return 'Tanpa role aktif';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/, 1)[0] ?? name;
}
