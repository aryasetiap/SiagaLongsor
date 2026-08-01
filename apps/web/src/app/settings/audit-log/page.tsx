'use client';

import { AuditLogManager } from '../../../audit/audit-log-manager';
import { getDefaultApiClient } from '../../../auth/default-api-client';
import { ProtectedRoute } from '../../../auth/protected-route';
import { ApplicationShell } from '../../../components/application-shell';
import { useOrganization } from '../../../organization/organization-context';

export default function AuditLogPage() {
  return (
    <ProtectedRoute>
      {(principal) => (
        <ApplicationShell
          principal={principal}
          title="Audit Log"
          subtitle="Riwayat perubahan sensitif yang telah disanitasi."
        >
          <AuditLogContent />
        </ApplicationShell>
      )}
    </ProtectedRoute>
  );
}

function AuditLogContent() {
  const organization = useOrganization();
  const api = getDefaultApiClient();
  if (organization.activeMembership?.role !== 'PROJECT_OWNER')
    return (
      <div role="alert" className="error-banner">
        Halaman ini hanya tersedia untuk Project Owner.
      </div>
    );
  if (organization.activeOrganizationId === null || api.client === null)
    return (
      <div role="alert" className="error-banner">
        Organisasi atau konfigurasi API belum tersedia.
      </div>
    );
  return <AuditLogManager client={api.client} organizationId={organization.activeOrganizationId} />;
}
