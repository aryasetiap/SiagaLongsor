'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type { Principal, Role } from '../auth/auth-types';
import { useOrganization } from '../organization/organization-context';
import { BrandMark } from './brand-mark';

interface ApplicationShellProps {
  readonly principal: Principal;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}

interface NavigationItem {
  readonly label: string;
  readonly href?: string;
  readonly roles: readonly Role[];
}

const navigation: readonly NavigationItem[] = [
  { label: 'Overview', href: '/overview', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  {
    label: 'Monitoring',
    href: '/monitoring-points',
    roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
  },
  { label: 'Peringatan', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  { label: 'Peta & Evakuasi', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  {
    label: 'Perangkat',
    href: '/devices',
    roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
  },
  { label: 'Laporan', roles: ['PROJECT_OWNER', 'SCHOOL_ADMIN'] },
  { label: 'Pengaturan', roles: ['PROJECT_OWNER'] },
];

export function ApplicationShell({ principal, title, subtitle, children }: ApplicationShellProps) {
  const router = useRouter();
  const pathname = usePathname();
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
          {visibleNavigation.map((item) => {
            const active =
              item.href !== undefined &&
              (pathname === item.href ||
                (item.href !== '/overview' && pathname.startsWith(`${item.href}/`)));

            return item.href === undefined ? (
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
                className={`shell-nav-item shrink-0 ${active ? 'shell-nav-item-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <NavigationIcon label={item.label} />
                <span>{item.label}</span>
              </Link>
            );
          })}
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
            <p className="text-xs font-semibold text-slate-500">{subtitle ?? 'Ruang kerja'}</p>
            <h1 className="mt-1 text-lg font-bold text-slate-950">{title}</h1>
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
              <span aria-hidden="true" className="text-slate-400">
                ▾
              </span>
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

        <main className="px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function NavigationIcon({ label }: { readonly label: string }) {
  return (
    <span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-600">
      {label.slice(0, 1)}
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
