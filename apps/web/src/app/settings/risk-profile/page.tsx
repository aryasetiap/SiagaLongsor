'use client';

import { getDefaultApiClient } from '../../../auth/default-api-client';
import { ProtectedRoute } from '../../../auth/protected-route';
import { ApplicationShell } from '../../../components/application-shell';
import { ProfilePanel, ProjectOwnerRequired } from '../../../single-device/panels';

export default function RiskProfilePage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Profil Risiko"
          subtitle="Atur ambang Waspada dan Siaga yang digunakan untuk menilai kondisi lereng."
        >
          {principal.memberships.some((membership) => membership.role === 'PROJECT_OWNER') ? (
            <SingleDeviceProfile />
          ) : (
            <ProjectOwnerRequired />
          )}
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function SingleDeviceProfile() {
  const api = getDefaultApiClient();
  return api.client === null ? (
    <div role="alert" className="error-banner">
      {api.configurationError ?? 'Konfigurasi API frontend tidak tersedia.'}
    </div>
  ) : (
    <ProfilePanel client={api.client} />
  );
}
