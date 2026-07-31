'use client';

import { getDefaultApiClient } from '../../../auth/default-api-client';
import { ProtectedRoute } from '../../../auth/protected-route';
import { ApplicationShell } from '../../../components/application-shell';
import { useOrganization } from '../../../organization/organization-context';
import { RiskProfileManager } from '../../../risk/risk-profile-manager';

export default function RiskProfilePage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Profil Risiko"
          subtitle="Konfigurasi risiko versioned per Site."
        >
          <ProfileContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const organization = useOrganization();
  const api = getDefaultApiClient();
  if (organization.activeOrganizationId === null || organization.activeMembership === null) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        Pilih organisasi aktif untuk melihat profil risiko.
      </p>
    );
  }
  if (api.client === null)
    return (
      <div role="alert" className="error-banner">
        {api.configurationError}
      </div>
    );
  return (
    <RiskProfileManager
      key={organization.activeOrganizationId}
      client={api.client}
      organizationId={organization.activeOrganizationId}
      role={organization.activeMembership.role}
    />
  );
}
