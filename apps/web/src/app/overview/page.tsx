'use client';

import { getDefaultApiClient } from '../../auth/default-api-client';
import { PublicDashboardShell } from '../../components/public-dashboard-shell';
import { OverviewPanel } from '../../single-device/panels';

export default function OverviewPage() {
  return (
    <PublicDashboardShell
      title="Overview"
      subtitle="Ringkasan publik kondisi sensor dan tingkat risiko terkini."
    >
      <SingleDeviceOverview />
    </PublicDashboardShell>
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
