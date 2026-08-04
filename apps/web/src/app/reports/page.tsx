'use client';
import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { useOrganization } from '../../organization/organization-context';
import { ReportsManager } from '../../reports/reports-manager';
export default function ReportsPage() {
  return (
    <ProtectedRoute>
      {(p) => (
        <ApplicationShell
          principal={p}
          title="Reports"
          subtitle="Ekspor telemetry dan laporan PDF private."
        >
          <Content />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}
function Content() {
  const o = useOrganization(),
    a = getDefaultApiClient();
  return !o.activeOrganizationId || !a.client ? (
    <p className="error-banner">Konfigurasi organisasi atau API tidak tersedia.</p>
  ) : (
    <ReportsManager
      key={o.activeOrganizationId}
      client={a.client}
      organizationId={o.activeOrganizationId}
    />
  );
}
