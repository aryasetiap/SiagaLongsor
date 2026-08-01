'use client';

import { AlertsManager } from '../../risk/alerts-manager';
import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { useOrganization } from '../../organization/organization-context';

export default function AlertsPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Peringatan"
          subtitle="Daftar peringatan operasional read-only."
        >
          <AlertsContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function AlertsContent() {
  const organization = useOrganization();
  const api = getDefaultApiClient();
  if (organization.activeOrganizationId === null) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        Pilih organisasi aktif untuk melihat peringatan.
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
    <AlertsManager
      key={organization.activeOrganizationId}
      client={api.client}
      organizationId={organization.activeOrganizationId}
      {...(organization.activeMembership === null
        ? {}
        : { role: organization.activeMembership.role })}
    />
  );
}
