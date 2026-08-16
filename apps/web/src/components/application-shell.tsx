'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type { Principal } from '../auth/auth-types';
import { AccountMenu } from './account-menu';
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
  { label: 'Riwayat Status Risiko', href: '/settings/audit-log' },
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
    <div className="app-shell min-h-screen md:p-4">
      <div className="app-frame md:grid md:grid-cols-[248px_1fr]">
        <aside className="app-sidebar px-4 py-4 md:min-h-[calc(100vh-2rem)] md:px-5 md:py-6 md:flex md:flex-col">
          <div className="flex items-center justify-between md:block">
            <BrandMark />
            <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 md:hidden">
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

          <p className="sidebar-institutional-note">Universitas Lampung · Fakultas Teknik</p>
          <div className="sidebar-access-card mt-4 rounded-2xl p-4 md:mt-8">
            <p className="text-xs font-semibold text-slate-400">Peran akun</p>
            <p className="mt-2 text-sm font-bold text-white">
              {hasProjectOwnerAccess ? 'Administrator perangkat' : 'Akses terbatas'}
            </p>
            {!hasProjectOwnerAccess && (
              <p className="mt-1 text-xs text-slate-300">
                Halaman pemantauan memerlukan akses Project Owner.
              </p>
            )}
          </div>
        </aside>

        <div className="app-canvas min-w-0">
          <header className="app-header flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <div>
              <h1 className="text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
                {title}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{subtitle ?? 'Ruang kerja'}</p>
            </div>

            <AccountMenu
              principal={principal}
              roleLabel={hasProjectOwnerAccess ? 'Project Owner' : 'Akses terbatas'}
              message="Sesi aktif dan terverifikasi"
              loggingOut={loggingOut}
              onLogout={logout}
            />
          </header>

          <main className="px-5 py-5 sm:px-8 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function NavigationIcon({ label }: { readonly label: string }) {
  return (
    <span className="grid size-7 place-items-center" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-4"
        stroke="currentColor"
        strokeWidth="1.9"
      >
        <path
          d={
            label === 'Overview'
              ? 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'
              : label === 'Perangkat'
                ? 'M8 4h8v4H8zM6 8h12v12H6zM10 12h4M12 10v4'
                : label === 'Profil Risiko'
                  ? 'M4 7h16M4 17h16M8 4v6M16 14v6'
                  : 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4'
          }
        />
      </svg>
    </span>
  );
}
