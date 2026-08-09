'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAuth } from '../auth/auth-context';
import { BrandMark } from './brand-mark';

interface PublicDashboardShellProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
}

export function PublicDashboardShell({ children, title, subtitle }: PublicDashboardShellProps) {
  const auth = useAuth();
  const hasAdminAccess =
    auth.principal?.memberships.some((membership) => membership.role === 'PROJECT_OWNER') ?? false;

  return (
    <div className="app-shell min-h-screen md:p-4">
      <div className="app-frame md:grid md:grid-cols-[248px_1fr]">
        <aside className="app-sidebar px-4 py-4 md:min-h-[calc(100vh-2rem)] md:px-5 md:py-6">
          <div className="flex items-center justify-between md:block">
            <BrandMark inverted />
            <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 md:hidden">
              Akses publik
            </span>
          </div>

          <nav className="mt-5 md:mt-10" aria-label="Navigasi publik">
            <Link
              href="/overview"
              className="shell-nav-item shell-nav-item-active"
              aria-current="page"
            >
              <span className="grid size-7 place-items-center" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-4"
                  stroke="currentColor"
                  strokeWidth="1.9"
                >
                  <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                </svg>
              </span>
              <span>Overview</span>
            </Link>
          </nav>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:mt-8">
            <p className="text-xs font-semibold text-slate-400">Akses dashboard</p>
            <p className="mt-2 text-sm font-bold text-white">Pemantauan publik</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Menampilkan status risiko dan riwayat sensor tanpa data administrasi perangkat.
            </p>
          </div>
        </aside>

        <div className="app-canvas min-w-0">
          <header className="app-header flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <div>
              <h1 className="text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
                {title}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{subtitle ?? 'Dashboard publik'}</p>
            </div>

            <Link
              href={hasAdminAccess ? '/devices' : '/login'}
              className="secondary-button bg-white"
            >
              {hasAdminAccess ? 'Buka panel admin' : 'Masuk administrator'}
            </Link>
          </header>

          <main className="px-5 py-5 sm:px-8 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
