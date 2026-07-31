import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider, type AuthClient, useAuth } from '../auth/auth-context';
import type { Principal, PrincipalMembership } from '../auth/auth-types';
import { OrganizationProvider, useOrganization } from './organization-context';

const ownerMembership: PrincipalMembership = {
  organizationId: 'org-owner',
  organizationName: 'Organisasi Pemilik',
  role: 'PROJECT_OWNER',
};

const adminMembership: PrincipalMembership = {
  organizationId: 'org-admin',
  organizationName: 'Organisasi Admin',
  role: 'SCHOOL_ADMIN',
};

describe('OrganizationProvider', () => {
  it('automatically selects exactly one membership', async () => {
    renderOrganization(principal([adminMembership]));

    expect(await screen.findByTestId('active-organization')).toHaveTextContent('org-admin');
    expect(screen.getByTestId('active-role')).toHaveTextContent('SCHOOL_ADMIN');
  });

  it('does not silently select the first of multiple memberships', async () => {
    renderOrganization(principal([ownerMembership, adminMembership]));

    expect(await screen.findByTestId('available-count')).toHaveTextContent('2');
    expect(screen.getByTestId('active-organization')).toHaveTextContent('none');
    expect(screen.getByTestId('active-role')).toHaveTextContent('none');
  });

  it('allows an organization from memberships to be selected', async () => {
    const user = userEvent.setup();
    renderOrganization(principal([ownerMembership, adminMembership]));

    await user.click(await screen.findByRole('button', { name: 'Pilih admin' }));

    expect(screen.getByTestId('active-organization')).toHaveTextContent('org-admin');
    expect(screen.getByTestId('active-role')).toHaveTextContent('SCHOOL_ADMIN');
  });

  it('clears an invalid organization selection', async () => {
    const user = userEvent.setup();
    renderOrganization(principal([ownerMembership, adminMembership]));
    await user.click(await screen.findByRole('button', { name: 'Pilih admin' }));
    expect(screen.getByTestId('active-organization')).toHaveTextContent('org-admin');

    await user.click(screen.getByRole('button', { name: 'Pilih invalid' }));

    expect(screen.getByTestId('active-organization')).toHaveTextContent('none');
  });

  it('has no active organization without memberships', async () => {
    renderOrganization(principal([]));

    expect(await screen.findByTestId('available-count')).toHaveTextContent('0');
    expect(screen.getByTestId('active-organization')).toHaveTextContent('none');
  });

  it('clears organization context after logout', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    renderOrganization(principal([ownerMembership, adminMembership]), { logout });
    await user.click(await screen.findByRole('button', { name: 'Pilih admin' }));
    expect(screen.getByTestId('active-organization')).toHaveTextContent('org-admin');

    await user.click(screen.getByRole('button', { name: 'Logout probe' }));

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByTestId('active-organization')).toHaveTextContent('none');
    expect(screen.getByTestId('available-count')).toHaveTextContent('0');
  });
});

function renderOrganization(currentPrincipal: Principal, overrides: Partial<AuthClient> = {}) {
  const client: AuthClient = {
    bootstrapSession: vi.fn().mockResolvedValue(currentPrincipal),
    login: vi.fn().mockResolvedValue(currentPrincipal),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(
    <AuthProvider client={client}>
      <OrganizationProvider>
        <OrganizationProbe />
      </OrganizationProvider>
    </AuthProvider>,
  );
}

function OrganizationProbe() {
  const organization = useOrganization();
  const auth = useAuth();
  return (
    <div>
      <p data-testid="active-organization">{organization.activeOrganizationId ?? 'none'}</p>
      <p data-testid="active-role">{organization.activeMembership?.role ?? 'none'}</p>
      <p data-testid="available-count">{organization.availableMemberships.length}</p>
      <button type="button" onClick={() => organization.selectOrganization('org-admin')}>
        Pilih admin
      </button>
      <button type="button" onClick={() => organization.selectOrganization('org-invalid')}>
        Pilih invalid
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Logout probe
      </button>
    </div>
  );
}

function principal(memberships: readonly PrincipalMembership[]): Principal {
  return {
    id: 'user-organization',
    email: 'organization@example.invalid',
    name: 'Pengguna Organization',
    memberships,
  };
}
