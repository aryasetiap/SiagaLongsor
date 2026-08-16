'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';
import { DevicePanel, ProjectOwnerRequired } from '../../single-device/panels';

export default function DevicesPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Perangkat"
          subtitle="Pantau konektivitas perangkat dan ketersediaan data sensor terbaru."
        >
          {principal.memberships.some((membership) => membership.role === 'PROJECT_OWNER') ? (
            <SingleDeviceDevice />
          ) : (
            <ProjectOwnerRequired />
          )}
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function SingleDeviceDevice() {
  const api = getDefaultApiClient();
  return api.client === null ? (
    <div role="alert" className="error-banner">
      {api.configurationError ?? 'Konfigurasi API frontend tidak tersedia.'}
    </div>
  ) : (
    <DevicePanel client={api.client} />
  );
}
