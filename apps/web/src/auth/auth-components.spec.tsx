import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationShell } from '../components/application-shell';
import { PublicDashboardShell } from '../components/public-dashboard-shell';
import { AuthProvider, type AuthClient, useAuth } from './auth-context';
import type { Principal, Role } from './auth-types';
import { ProtectedRoute } from './protected-route';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/overview',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ replace: navigationMocks.replace }),
}));

describe('AuthProvider and protected content', () => {
  beforeEach(() => {
    navigationMocks.pathname = '/overview';
    navigationMocks.replace.mockReset();
  });

  it('hides protected content until refresh bootstrap resolves', async () => {
    let finishBootstrap: ((principal: Principal) => void) | undefined;
    const client = createClient({
      bootstrapSession: () =>
        new Promise<Principal>((resolve) => {
          finishBootstrap = resolve;
        }),
    });
    render(
      <AuthProvider client={client}>
        <ProtectedRoute>{(current) => <p>Konten untuk {current.name}</p>}</ProtectedRoute>
      </AuthProvider>,
    );

    expect(screen.queryByText(/Konten untuk/)).not.toBeInTheDocument();
    expect(screen.getByText('Memeriksa sesi aman…')).toBeInTheDocument();
    finishBootstrap?.(createPrincipal('SCHOOL_ADMIN'));
    expect(await screen.findByText('Konten untuk Admin Sekolah')).toBeInTheDocument();
  });

  it('redirects when refresh bootstrap finds no valid session', async () => {
    const client = createClient({ bootstrapSession: vi.fn().mockResolvedValue(null) });
    render(
      <AuthProvider client={client}>
        <ProtectedRoute>{() => <p>Rahasia protected</p>}</ProtectedRoute>
      </AuthProvider>,
    );

    await vi.waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Rahasia protected')).not.toBeInTheDocument();
    expect(screen.queryByText(/Layanan autentikasi sedang tidak tersedia/)).not.toBeInTheDocument();
  });

  it('renders the public dashboard while session bootstrap is unresolved', () => {
    const client = createClient({
      bootstrapSession: () => new Promise<Principal | null>(() => {}),
    });
    render(
      <AuthProvider client={client}>
        <PublicDashboardShell title="Overview">
          <p>Data pemantauan publik</p>
        </PublicDashboardShell>
      </AuthProvider>,
    );

    expect(screen.getByText('Data pemantauan publik')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Masuk administrator' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it('shows the active school account and allows it to log out from the public dashboard', async () => {
    const user = userEvent.setup();
    const principal = createPrincipal('SCHOOL_ADMIN');
    const logout = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthProvider
        client={createClient({
          bootstrapSession: vi.fn().mockResolvedValue(principal),
          logout,
        })}
      >
        <PublicDashboardShell title="Overview">
          <p>Data pemantauan publik</p>
        </PublicDashboardShell>
      </AuthProvider>,
    );

    const accountMenu = await screen.findByLabelText('Menu akun Admin Sekolah');
    expect(screen.queryByRole('link', { name: 'Masuk administrator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Buka panel admin' })).not.toBeInTheDocument();

    await user.click(accountMenu);
    expect(
      screen.getByText(/Akses administrasi perangkat hanya tersedia untuk Project Owner/),
    ).toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Menu akun Admin Sekolah' })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu', { name: 'Menu akun Admin Sekolah' })).not.toBeInTheDocument();
    await user.click(accountMenu);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Menu akun Admin Sekolah' })).not.toBeInTheDocument();
    expect(accountMenu).toHaveFocus();
    await user.click(accountMenu);
    await user.click(screen.getByRole('menuitem', { name: 'Keluar' }));

    expect(logout).toHaveBeenCalledOnce();
    expect(navigationMocks.replace).toHaveBeenCalledWith('/login');
  });

  it('clamps the account popover inside a narrow viewport', async () => {
    const user = userEvent.setup();
    const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    try {
      render(
        <AuthProvider
          client={createClient({
            bootstrapSession: vi.fn().mockResolvedValue(createPrincipal('SCHOOL_ADMIN')),
          })}
        >
          <PublicDashboardShell title="Overview">
            <p>Data pemantauan publik</p>
          </PublicDashboardShell>
        </AuthProvider>,
      );
      const accountMenu = await screen.findByLabelText('Menu akun Admin Sekolah');
      accountMenu.getBoundingClientRect = () =>
        ({ bottom: 112, height: 44, left: 12, right: 56, top: 68, width: 44 }) as DOMRect;

      await user.click(accountMenu);

      const sheet = screen.getByRole('dialog', { name: 'Menu akun Admin Sekolah' });
      expect(sheet).toHaveClass('mobile-account-sheet');
    } finally {
      if (originalInnerWidth === undefined) delete (window as { innerWidth?: number }).innerWidth;
      else Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    }
  });

  it('opens the complete administration shell directly for an authenticated project owner', async () => {
    const principal = createPrincipal('PROJECT_OWNER');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <PublicDashboardShell title="Overview">
          <p>Data pemantauan publik</p>
        </PublicDashboardShell>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: /Overview/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Perangkat/ })).toHaveAttribute('href', '/devices');
    expect(screen.getByRole('link', { name: /Profil Risiko/ })).toHaveAttribute(
      'href',
      '/settings/risk-profile',
    );
    expect(screen.queryByRole('link', { name: 'Masuk administrator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Buka panel admin' })).not.toBeInTheDocument();
  });

  it('exposes an availability message when session bootstrap cannot reach the API', async () => {
    const client = createClient({
      bootstrapSession: vi.fn().mockRejectedValue(new Error('offline')),
    });
    render(
      <AuthProvider client={client}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    expect(
      await screen.findByText('Layanan autentikasi sedang tidak tersedia. Silakan coba kembali.'),
    ).toBeInTheDocument();
  });

  it('clears a stale bootstrap availability message when a new login starts', async () => {
    const user = userEvent.setup();
    let finishLogin: ((principal: Principal) => void) | undefined;
    const client = createClient({
      bootstrapSession: vi.fn().mockRejectedValue(new Error('offline')),
      login: vi.fn(
        () =>
          new Promise<Principal>((resolve) => {
            finishLogin = resolve;
          }),
      ),
    });
    render(
      <AuthProvider client={client}>
        <AuthLoginProbe />
      </AuthProvider>,
    );

    expect(
      await screen.findByText('Layanan autentikasi sedang tidak tersedia. Silakan coba kembali.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mulai login' }));

    expect(
      screen.queryByText('Layanan autentikasi sedang tidak tersedia. Silakan coba kembali.'),
    ).not.toBeInTheDocument();
    expect(client.login).toHaveBeenCalledOnce();
    finishLogin?.(createPrincipal('SCHOOL_ADMIN'));
  });

  it.each(['PROJECT_OWNER' as const, 'SCHOOL_ADMIN' as const])(
    'renders the R3 menu access state for %s',
    async (role) => {
      const principal = createPrincipal(role);
      render(
        <AuthProvider
          client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
        >
          <ApplicationShell principal={principal} title="Overview">
            <p>Konten shell</p>
          </ApplicationShell>
        </AuthProvider>,
      );

      if (role === 'PROJECT_OWNER') {
        expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/overview');
        expect(screen.getByRole('link', { name: /Perangkat/ })).toHaveAttribute('href', '/devices');
        expect(screen.getByRole('link', { name: /Profil Risiko/ })).toHaveAttribute(
          'href',
          '/settings/risk-profile',
        );
        expect(screen.getByRole('link', { name: /Riwayat Status Risiko/ })).toHaveAttribute(
          'href',
          '/settings/audit-log',
        );
      } else {
        expect(screen.getByText(/memerlukan akses Project Owner/)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Overview/ })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('link', { name: /Riwayat Status Risiko/ }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('derives R3 access from the authenticated principal without an organization selector', async () => {
    const principal = createMultiOrganizationPrincipal();
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <ApplicationShell principal={principal} title="Overview">
          <p>Konten shell</p>
        </ApplicationShell>
      </AuthProvider>,
    );

    expect(screen.queryByRole('combobox', { name: 'Organisasi aktif' })).not.toBeInTheDocument();
    expect(screen.getByText('Administrator perangkat')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Perangkat/ })).toBeInTheDocument();
  });

  it('clears local auth state and redirects even when server logout fails', async () => {
    const user = userEvent.setup();
    const principal = createPrincipal('SCHOOL_ADMIN');
    const logout = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <AuthProvider
        client={createClient({
          bootstrapSession: vi.fn().mockResolvedValue(principal),
          logout,
        })}
      >
        <ApplicationShell principal={principal} title="Overview">
          <p>Konten shell</p>
        </ApplicationShell>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Menu akun Admin Sekolah/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Keluar' }));

    expect(logout).toHaveBeenCalledOnce();
    expect(navigationMocks.replace).toHaveBeenCalledWith('/login');
    expect(
      await screen.findByText(/Sesi lokal telah diakhiri, tetapi server tidak dapat dikonfirmasi/),
    ).toBeInTheDocument();
  });

  it('marks Overview as active using the current pathname', async () => {
    navigationMocks.pathname = '/overview';
    const principal = createPrincipal('PROJECT_OWNER');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <ApplicationShell principal={principal} title="Overview">
          <p>Ringkasan kondisi</p>
        </ApplicationShell>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: /Overview/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks Devices as active using the current pathname', async () => {
    navigationMocks.pathname = '/devices';
    const principal = createPrincipal('PROJECT_OWNER');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <ApplicationShell principal={principal} title="Perangkat">
          <p>Diagnostik perangkat</p>
        </ApplicationShell>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: /Perangkat/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each([
    ['/settings/risk-profile', /Profil Risiko/],
    ['/settings/audit-log', /Riwayat Status Risiko/],
  ])('marks the R3 navigation for %s as active', async (pathname, accessibleName) => {
    navigationMocks.pathname = pathname;
    const principal = createPrincipal('PROJECT_OWNER');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <ApplicationShell principal={principal} title="Operasional">
          <p>Konten operasional</p>
        </ApplicationShell>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: accessibleName })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

function AuthStateProbe() {
  const auth = useAuth();
  return (
    <div>
      <p>{auth.status}</p>
      {auth.message !== null && <p>{auth.message}</p>}
    </div>
  );
}

function AuthLoginProbe() {
  const auth = useAuth();
  return (
    <div>
      {auth.message !== null && <p>{auth.message}</p>}
      <button
        type="button"
        onClick={() => {
          void auth.login({ email: 'admin@example.invalid', password: 'test-password' });
        }}
      >
        Mulai login
      </button>
    </div>
  );
}

function createClient(overrides: Partial<AuthClient> = {}): AuthClient {
  const principal = createPrincipal('SCHOOL_ADMIN');
  return {
    bootstrapSession: vi.fn().mockResolvedValue(principal),
    login: vi.fn().mockResolvedValue(principal),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createPrincipal(role: Role): Principal {
  return {
    id: `user-${role}`,
    email: `${role.toLowerCase()}@example.invalid`,
    name: role === 'PROJECT_OWNER' ? 'Pemilik Proyek' : 'Admin Sekolah',
    memberships: [
      {
        organizationId: 'org-1',
        organizationName: 'SMAN 17 Bandar Lampung',
        role,
      },
    ],
  };
}

function createMultiOrganizationPrincipal(): Principal {
  return {
    id: 'user-multi',
    email: 'multi@example.invalid',
    name: 'Pengguna Multi',
    memberships: [
      {
        organizationId: 'org-owner',
        organizationName: 'Organisasi Pemilik',
        role: 'PROJECT_OWNER',
      },
      {
        organizationId: 'org-admin',
        organizationName: 'Organisasi Admin',
        role: 'SCHOOL_ADMIN',
      },
    ],
  };
}
