'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { DevicesManager } from '../../devices/devices-manager';
import { useOrganization } from '../../organization/organization-context';

export default function DevicesPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Perangkat"
          subtitle="Kelola assignment, credential, dan lifecycle perangkat."
        >
          <DevicesContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function DevicesContent() {
  const { activeMembership, activeOrganizationId, availableMemberships } = useOrganization();
  const api = getDefaultApiClient();

  if (activeOrganizationId === null || activeMembership === null) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="font-bold text-slate-900">Pilih organisasi aktif</h2>
        <p className="mt-2 text-sm text-slate-600">
          {availableMemberships.length > 1
            ? 'Gunakan pilihan organisasi di sidebar sebelum membuka data perangkat.'
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
    <DevicesManager
      key={activeOrganizationId}
      client={api.client}
      organizationId={activeOrganizationId}
      role={activeMembership.role}
    />
  );
}
