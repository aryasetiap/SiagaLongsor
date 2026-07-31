import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationShell } from '../components/application-shell';
import { AuthProvider, type AuthClient, useAuth } from './auth-context';
import type { Principal, Role } from './auth-types';
import { ProtectedRoute } from './protected-route';
import { OrganizationProvider } from '../organization/organization-context';

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

  it.each([
    ['PROJECT_OWNER' as const, true],
    ['SCHOOL_ADMIN' as const, false],
  ])('renders the expected menu structure for %s', async (role, seesOwnerMenu) => {
    const principal = createPrincipal(role);
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <OrganizationProvider>
          <ApplicationShell principal={principal} title="Overview">
            <p>Konten shell</p>
          </ApplicationShell>
        </OrganizationProvider>
      </AuthProvider>,
    );

    expect(
      (await screen.findAllByText(role === 'PROJECT_OWNER' ? 'Project Owner' : 'Admin Sekolah'))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Monitoring/ })).toHaveAttribute(
      'href',
      '/monitoring-points',
    );
    expect(screen.getByRole('link', { name: /Perangkat/ })).toHaveAttribute('href', '/devices');
    expect(screen.getByRole('link', { name: /Peringatan/ })).toHaveAttribute('href', '/alerts');
    expect(screen.getByRole('link', { name: /Profil Risiko/ })).toHaveAttribute(
      'href',
      '/settings/risk-profile',
    );
    expect(seesOwnerMenu || role === 'SCHOOL_ADMIN').toBe(true);
  });

  it('uses the selected organization role for shell identity and navigation', async () => {
    const user = userEvent.setup();
    const principal = createMultiOrganizationPrincipal();
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <OrganizationProvider>
          <ApplicationShell principal={principal} title="Overview">
            <p>Konten shell</p>
          </ApplicationShell>
        </OrganizationProvider>
      </AuthProvider>,
    );

    const selector = await screen.findByRole('combobox', { name: 'Organisasi aktif' });
    expect(selector).toHaveValue('');
    expect(screen.queryByRole('link', { name: /Perangkat/ })).not.toBeInTheDocument();

    await user.selectOptions(selector, 'org-owner');
    expect(screen.getAllByText('Organisasi Pemilik').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project Owner').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Perangkat/ })).toBeInTheDocument();

    await user.selectOptions(selector, 'org-admin');
    expect(screen.getAllByText('Organisasi Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Admin Sekolah').length).toBeGreaterThan(0);
    expect(screen.queryByText('Project Owner')).not.toBeInTheDocument();
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
        <OrganizationProvider>
          <ApplicationShell principal={principal} title="Overview">
            <p>Konten shell</p>
          </ApplicationShell>
          <AuthStateProbe />
        </OrganizationProvider>
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Keluar' }));

    expect(logout).toHaveBeenCalledOnce();
    expect(navigationMocks.replace).toHaveBeenCalledWith('/login');
    expect(
      await screen.findByText(/Sesi lokal telah diakhiri, tetapi server tidak dapat dikonfirmasi/),
    ).toBeInTheDocument();
  });

  it('marks Monitoring as active using the current pathname', async () => {
    navigationMocks.pathname = '/monitoring-points';
    const principal = createPrincipal('PROJECT_OWNER');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <OrganizationProvider>
          <ApplicationShell principal={principal} title="Titik monitoring">
            <p>Daftar titik monitoring</p>
          </ApplicationShell>
        </OrganizationProvider>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: /Monitoring/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Overview/ })).not.toHaveAttribute('aria-current');
  });

  it('marks Devices as active using the current pathname', async () => {
    navigationMocks.pathname = '/devices';
    const principal = createPrincipal('SCHOOL_ADMIN');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <OrganizationProvider>
          <ApplicationShell principal={principal} title="Perangkat">
            <p>Daftar perangkat</p>
          </ApplicationShell>
        </OrganizationProvider>
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: /Perangkat/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each([
    ['/alerts', /Peringatan/],
    ['/settings/risk-profile', /Profil Risiko/],
  ])('marks the Phase 03 navigation for %s as active', async (pathname, accessibleName) => {
    navigationMocks.pathname = pathname;
    const principal = createPrincipal('SCHOOL_ADMIN');
    render(
      <AuthProvider
        client={createClient({ bootstrapSession: vi.fn().mockResolvedValue(principal) })}
      >
        <OrganizationProvider>
          <ApplicationShell principal={principal} title="Operasional">
            <p>Konten operasional</p>
          </ApplicationShell>
        </OrganizationProvider>
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
