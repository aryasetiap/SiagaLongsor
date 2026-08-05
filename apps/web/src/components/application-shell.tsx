'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type { Principal } from '../auth/auth-types';
import { BrandMark } from './brand-mark';

interface ApplicationShellProps {
  readonly principal: Principal;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}

interface NavigationItem {
  readonly label: string;
  readonly href: string;
}

export const primaryNavigation: readonly NavigationItem[] = [
  { label: 'Overview', href: '/overview' },
  { label: 'Perangkat', href: '/devices' },
  { label: 'Profil Risiko', href: '/settings/risk-profile' },
  { label: 'Audit Log', href: '/settings/audit-log' },
];

export function ApplicationShell({ principal, title, subtitle, children }: ApplicationShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const hasProjectOwnerAccess = principal.memberships.some(
    (membership) => membership.role === 'PROJECT_OWNER',
  );
  const visibleNavigation = hasProjectOwnerAccess ? primaryNavigation : [];

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

            return (
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
          <p className="text-xs font-semibold text-slate-500">Akses produk</p>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {hasProjectOwnerAccess ? 'Administrator perangkat' : 'Akses terbatas'}
          </p>
          {!hasProjectOwnerAccess && (
            <p className="mt-1 text-xs text-slate-500">
              Halaman pemantauan memerlukan akses Project Owner.
            </p>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-8">
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
                <span className="block text-xs text-slate-500">
                  {hasProjectOwnerAccess ? 'Project Owner' : 'Akses terbatas'}
                </span>
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
