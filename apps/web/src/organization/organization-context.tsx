'use client';

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type { PrincipalMembership } from '../auth/auth-types';

export interface OrganizationContextValue {
  readonly activeMembership: PrincipalMembership | null;
  readonly activeOrganizationId: string | null;
  readonly availableMemberships: readonly PrincipalMembership[];
  selectOrganization(organizationId: string): void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

interface OrganizationSelection {
  readonly organizationId: string;
  readonly principal: NonNullable<ReturnType<typeof useAuth>['principal']>;
}

export function OrganizationProvider({ children }: { readonly children: ReactNode }) {
  const { principal } = useAuth();
  const availableMemberships = useMemo(() => principal?.memberships ?? [], [principal]);
  const [selection, setSelection] = useState<OrganizationSelection | null>(null);
  const explicitlySelectedMembership =
    selection?.principal === principal
      ? (availableMemberships.find(
          (membership) => membership.organizationId === selection.organizationId,
        ) ?? null)
      : null;
  const activeMembership =
    availableMemberships.length === 1
      ? (availableMemberships[0] ?? null)
      : explicitlySelectedMembership;

  const value = useMemo<OrganizationContextValue>(
    () => ({
      activeMembership,
      activeOrganizationId: activeMembership?.organizationId ?? null,
      availableMemberships,
      selectOrganization(organizationId) {
        const selectionIsValid =
          principal !== null &&
          availableMemberships.some((membership) => membership.organizationId === organizationId);

        setSelection(
          selectionIsValid
            ? {
                organizationId,
                principal,
              }
            : null,
        );
      },
    }),
    [activeMembership, availableMemberships, principal],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (context === null) {
    throw new Error('useOrganization harus digunakan di dalam OrganizationProvider.');
  }
  return context;
}
