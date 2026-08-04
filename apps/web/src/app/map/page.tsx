'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { MapManager } from '../../map/map-manager';
import { useOrganization } from '../../organization/organization-context';

export default function MapPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Peta & Evakuasi"
          subtitle="Konfigurasi manual, status titik authoritative, dan SOP resmi."
        >
          <MapContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}
function MapContent() {
  const organization = useOrganization();
  const api = getDefaultApiClient();
  if (!organization.activeOrganizationId || !organization.activeMembership)
    return <p className="error-banner">Pilih organisasi aktif sebelum membuka peta.</p>;
  if (!api.client)
    return (
      <p className="error-banner">{api.configurationError ?? 'Konfigurasi API tidak tersedia.'}</p>
    );
  return (
    <MapManager
      key={organization.activeOrganizationId}
      client={api.client}
      organizationId={organization.activeOrganizationId}
      role={organization.activeMembership.role}
    />
  );
}
