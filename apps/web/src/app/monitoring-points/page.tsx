'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { MonitoringPointsManager } from '../../monitoring-points/monitoring-points-manager';
import { useOrganization } from '../../organization/organization-context';

export default function MonitoringPointsPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Titik monitoring"
          subtitle="Kelola lokasi pemantauan pada organisasi aktif."
        >
          <MonitoringPointsContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function MonitoringPointsContent() {
  const { activeMembership, activeOrganizationId, availableMemberships } = useOrganization();
  const api = getDefaultApiClient();

  if (activeOrganizationId === null || activeMembership === null) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="font-bold text-slate-900">Pilih organisasi aktif</h2>
        <p className="mt-2 text-sm text-slate-600">
          {availableMemberships.length > 1
            ? 'Gunakan pilihan organisasi di sidebar sebelum membuka data titik monitoring.'
            : 'Tidak ada organisasi aktif yang dapat digunakan.'}
        </p>
      </div>
    );
  }

  if (api.client === null) {
    return (
      <div role="alert" className="error-banner">
        {api.configurationError ?? 'Konfigurasi API frontend tidak tersedia.'}
      </div>
    );
  }

  return (
    <MonitoringPointsManager
      key={activeOrganizationId}
      client={api.client}
      organizationId={activeOrganizationId}
      role={activeMembership.role}
    />
  );
}
