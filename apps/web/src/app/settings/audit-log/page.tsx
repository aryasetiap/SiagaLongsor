'use client';

import { getDefaultApiClient } from '../../../auth/default-api-client';
import { ProtectedRoute } from '../../../auth/protected-route';
import { ApplicationShell } from '../../../components/application-shell';
import { AuditPanel, ProjectOwnerRequired } from '../../../single-device/panels';

export default function AuditLogPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Riwayat Status Risiko"
          subtitle="Riwayat perubahan status risiko yang bersifat otoritatif."
        >
          {principal.memberships.some((membership) => membership.role === 'PROJECT_OWNER') ? (
            <SingleDeviceAudit />
          ) : (
            <ProjectOwnerRequired />
          )}
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function SingleDeviceAudit() {
  const api = getDefaultApiClient();
  return api.client === null ? (
    <div role="alert" className="error-banner">
      {api.configurationError ?? 'Konfigurasi API frontend tidak tersedia.'}
    </div>
  ) : (
    <AuditPanel client={api.client} />
  );
}
