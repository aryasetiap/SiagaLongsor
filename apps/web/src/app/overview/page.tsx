'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { OverviewPanel, ProjectOwnerRequired } from '../../single-device/panels';

export default function OverviewPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Overview"
          subtitle="Ringkasan kondisi perangkat, sensor, dan tingkat risiko terkini."
        >
          {principal.memberships.some((membership) => membership.role === 'PROJECT_OWNER') ? (
            <SingleDeviceOverview />
          ) : (
            <ProjectOwnerRequired />
          )}
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function SingleDeviceOverview() {
  const api = getDefaultApiClient();
  return api.client === null ? (
    <div role="alert" className="error-banner">
      {api.configurationError ?? 'Konfigurasi API frontend tidak tersedia.'}
    </div>
  ) : (
    <OverviewPanel client={api.client} />
  );
}
