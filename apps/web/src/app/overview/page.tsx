'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { DashboardManager } from '../../dashboard/dashboard-manager';
import { useOrganization } from '../../organization/organization-context';

export default function OverviewPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Dashboard"
          subtitle="Ringkasan risiko, konektivitas, sensor, dan peringatan organisasi aktif."
        >
          <OverviewContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function OverviewContent() {
  const organization = useOrganization();
  const api = getDefaultApiClient();
  if (organization.activeOrganizationId === null) {
    return <OrganizationRequired multiple={organization.availableMemberships.length > 1} />;
  }
  if (api.client === null) {
    return (
      <div role="alert" className="error-banner">
        {api.configurationError ?? 'Konfigurasi API frontend tidak tersedia.'}
      </div>
    );
  }
  return (
    <DashboardManager
      key={organization.activeOrganizationId}
      client={api.client}
      organizationId={organization.activeOrganizationId}
    />
  );
}

function OrganizationRequired({ multiple }: { readonly multiple: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="font-bold text-slate-900">Pilih organisasi aktif</h2>
      <p className="mt-2 text-sm text-slate-600">
        {multiple
          ? 'Gunakan pilihan organisasi di sidebar untuk memuat overview.'
          : 'Tidak ada organisasi aktif yang dapat digunakan.'}
      </p>
    </div>
  );
}
