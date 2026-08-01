'use client';

import { useEffect, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import type { MonitoringOverviewItem } from '../risk/risk-contracts';
import { useOptionalRealtime } from '../realtime/realtime-context';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';
import type { DashboardWindowHours } from './dashboard-contracts';
import { MonitoringPanel } from './monitoring-panel';
import { RecentAlerts } from './recent-alerts';
import { SensorTrend } from './sensor-trend';
import { SummaryPanel } from './summary-panel';

export function DashboardManager({
  client,
  organizationId,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
}) {
  const realtime = useOptionalRealtime();
  const [sites, setSites] = useState<readonly Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [windowHours, setWindowHours] = useState<DashboardWindowHours>(24);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [selected, setSelected] = useState<MonitoringOverviewItem | null>(null);
  const [siteError, setSiteError] = useState(false);
  const dashboardGeneration = refreshGeneration + realtime.generations.dashboard;
  const monitoringGeneration = refreshGeneration + realtime.generations.monitoring;

  useEffect(() => {
    let active = true;
    void listSites(client, organizationId, { limit: 100, sort: 'name:asc' })
      .then((response) => {
        if (!active) return;
        setSites(response.data);
        setSiteError(false);
        setSiteId((current) =>
          current !== '' && !response.data.some((site) => site.id === current) ? '' : current,
        );
      })
      .catch(() => {
        if (!active) return;
        setSites([]);
        setSiteId('');
        setSiteError(true);
      });
    return () => {
      active = false;
    };
  }, [client, dashboardGeneration, organizationId]);

  function selectSite(value: string) {
    setSiteId(value);
    setSelected(null);
  }

  return (
    <div className="space-y-5" data-testid="phase-04-dashboard">
      <section
        aria-label="Kontrol dashboard"
        className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="text-xs font-semibold text-slate-700">
          Site
          <select
            aria-label="Filter Site dashboard"
            className="field-input mt-1 min-w-52"
            value={siteId}
            onChange={(event) => selectSite(event.target.value)}
          >
            <option value="">Semua Site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Rentang dashboard
          <select
            aria-label="Rentang dashboard"
            className="field-input mt-1 min-w-40"
            value={windowHours}
            onChange={(event) => setWindowHours(Number(event.target.value) as DashboardWindowHours)}
          >
            <option value={24}>24 jam</option>
            <option value={72}>72 jam</option>
            <option value={168}>168 jam</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          aria-label="Segarkan seluruh dashboard"
          onClick={() => setRefreshGeneration((value) => value + 1)}
        >
          ↻ Segarkan
        </button>
        <p aria-live="polite" className="text-xs text-slate-500">
          Realtime memicu pembaruan terkoordinasi. Penyegaran manual tetap tersedia.
        </p>
        {siteError && (
          <p role="alert" className="w-full text-xs font-semibold text-red-700">
            Pilihan Site tidak dapat dimuat. Panel lain tetap dapat digunakan.
          </p>
        )}
      </section>

      <SummaryPanel
        client={client}
        organizationId={organizationId}
        siteId={siteId}
        windowHours={windowHours}
        refreshGeneration={dashboardGeneration}
        overview={
          <MonitoringPanel
            client={client}
            organizationId={organizationId}
            siteId={siteId}
            refreshGeneration={monitoringGeneration}
            selected={selected}
            onSelect={setSelected}
          />
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <SensorTrend
          key={selected?.monitoringPoint.id ?? 'none'}
          client={client}
          organizationId={organizationId}
          selected={selected}
          windowHours={windowHours}
          refreshGeneration={dashboardGeneration}
        />
        <RecentAlerts
          client={client}
          organizationId={organizationId}
          siteId={siteId}
          refreshGeneration={dashboardGeneration}
        />
      </div>
    </div>
  );
}
