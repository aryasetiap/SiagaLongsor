'use client';

import { useEffect, useRef, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import { listSites } from '../sites/sites-api';
import type { Site } from '../sites/site-contracts';
import {
  downloadSop,
  getActiveSop,
  getMapConfiguration,
  getMapOverview,
  listSopVersions,
  putMapConfiguration,
  uploadSop,
} from './map-api';
import type { MapConfiguration, MapOverview, Position, SopDocument } from './map-contracts';

const maxBytes = 10 * 1024 * 1024;

export function MapManager({
  client,
  organizationId,
  role,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly role: Role;
}) {
  const requestEpoch = useRef(0);
  const [sites, setSites] = useState<readonly Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [overview, setOverview] = useState<MapOverview | null>(null);
  const [sop, setSop] = useState<SopDocument | null>(null);
  const [history, setHistory] = useState<readonly SopDocument[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(selected = siteId): Promise<void> {
    if (!selected) return;
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError(null);
    try {
      const [map, active, versions] = await Promise.all([
        getMapOverview(client, organizationId, selected),
        getActiveSop(client, organizationId, selected).catch((reason: unknown) =>
          reason instanceof ApiClientError && reason.status === 404 ? null : Promise.reject(reason),
        ),
        listSopVersions(client, organizationId, selected),
      ]);
      if (epoch !== requestEpoch.current) return;
      setOverview(map.data);
      setSop(active?.data ?? null);
      setHistory(versions.data);
      setCursor(versions.page.nextCursor);
    } catch {
      if (epoch === requestEpoch.current) {
        setError('Data peta belum dapat dimuat. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestEpoch.current += 1;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        setLoading(true);
        setOverview(null);
        setSop(null);
        setHistory([]);
        setCursor(null);
        return listSites(client, organizationId, { limit: 100, sort: 'name:asc' });
      })
      .then((page) => {
        if (!active || page === undefined) return;
        setSites(page.data);
        const firstSiteId = page.data[0]?.id ?? '';
        setSiteId(firstSiteId);
        if (firstSiteId) void refresh(firstSiteId);
        else setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Site tidak dapat dimuat.');
        setLoading(false);
      });
    return () => {
      active = false;
      requestEpoch.current += 1;
    };
    // refresh intentionally reads the current request scope; client/org changes remount this scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, organizationId]);

  async function selectSite(value: string): Promise<void> {
    requestEpoch.current += 1;
    setSiteId(value);
    setOverview(null);
    setSop(null);
    setHistory([]);
    setCursor(null);
    if (value) await refresh(value);
  }

  async function loadMore(): Promise<void> {
    if (cursor === null || !siteId) return;
    const epoch = requestEpoch.current;
    try {
      const page = await listSopVersions(client, organizationId, siteId, cursor);
      if (epoch !== requestEpoch.current) return;
      setHistory((current) => [...current, ...page.data]);
      setCursor(page.page.nextCursor);
    } catch {
      if (epoch === requestEpoch.current) setError('Riwayat SOP tidak dapat dimuat.');
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5">
        <h1 className="text-2xl font-bold text-slate-950">Map &amp; Evacuation</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tampilan ini memakai konfigurasi peta Site yang disetujui. Status titik monitoring berasal
          dari Map Overview authoritative.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-slate-800" htmlFor="map-site">
            Site
            <select
              id="map-site"
              value={siteId}
              onChange={(event) => void selectSite(event.target.value)}
              className="field-input mt-1 block"
            >
              <option value="">Pilih Site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refresh()}
            disabled={loading || !siteId}
          >
            {loading ? 'Memuatâ€¦' : 'Muat ulang'}
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="error-banner mt-3">
            {error}
          </p>
        )}
      </section>

      {loading ? <p aria-live="polite">Memuat peta authoritativeâ€¦</p> : null}
      {!loading && siteId === '' ? <EmptyState /> : null}
      {!loading && overview !== null ? (
        <>
          <MapOverviewPanel overview={overview} />
          {role === 'PROJECT_OWNER' ? (
            <MapConfigurationEditor
              client={client}
              organizationId={organizationId}
              siteId={siteId}
              onSaved={() => void refresh()}
            />
          ) : (
            <ReadOnlyNotice />
          )}
          <SopPanel
            client={client}
            organizationId={organizationId}
            siteId={siteId}
            role={role}
            activeDocument={sop}
            history={history}
            hasMore={cursor !== null}
            onChanged={() => void refresh()}
            onMore={() => void loadMore()}
          />
        </>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <p>Pilih Site untuk melihat konfigurasi peta dan SOP resmi.</p>
    </section>
  );
}

function ReadOnlyNotice() {
  return (
    <p className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
      Konfigurasi peta bersifat hanya-baca untuk School Admin.
    </p>
  );
}

function MapOverviewPanel({ overview }: { readonly overview: MapOverview }) {
  const [markersVisible, setMarkersVisible] = useState(true);
  const [zonesVisible, setZonesVisible] = useState(true);
  const [routesVisible, setRoutesVisible] = useState(true);
  if (!overview.configuration.configured) {
    return (
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-bold">Peta {overview.site.name}</h2>
        <p className="mt-3">
          Site ini belum memiliki konfigurasi peta. Tidak ada koordinat default yang ditampilkan.
        </p>
        <FallbackList markers={overview.markers} />
      </section>
    );
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="font-bold">Peta {overview.site.name}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Konfigurasi versi {overview.configuration.version}
      </p>
      <fieldset className="mt-4 flex flex-wrap gap-4 text-sm">
        <legend className="font-semibold">Lapisan peta</legend>
        <label>
          <input
            type="checkbox"
            checked={markersVisible}
            onChange={(event) => setMarkersVisible(event.target.checked)}
          />{' '}
          Titik monitoring
        </label>
        <label>
          <input
            type="checkbox"
            checked={zonesVisible}
            onChange={(event) => setZonesVisible(event.target.checked)}
          />{' '}
          Zona referensi statis
        </label>
        <label>
          <input
            type="checkbox"
            checked={routesVisible}
            onChange={(event) => setRoutesVisible(event.target.checked)}
          />{' '}
          Jalur evakuasi manual
        </label>
      </fieldset>
      <StaticMap
        overview={overview}
        markersVisible={markersVisible}
        zonesVisible={zonesVisible}
        routesVisible={routesVisible}
      />
      <Legend />
      <FallbackList markers={overview.markers} />
    </section>
  );
}

function StaticMap({
  overview,
  markersVisible,
  zonesVisible,
  routesVisible,
}: {
  readonly overview: MapOverview;
  readonly markersVisible: boolean;
  readonly zonesVisible: boolean;
  readonly routesVisible: boolean;
}) {
  const positions: Position[] = overview.markers.map((marker) => marker.position);
  overview.configuration.riskZones.forEach((zone) =>
    zone.geometry.coordinates.forEach((ring) => positions.push(...ring)),
  );
  overview.configuration.evacuationRoutes.forEach((route) =>
    positions.push(...route.geometry.coordinates),
  );
  if (overview.configuration.center !== null)
    positions.push(overview.configuration.center.position);
  const project = makeProjector(positions);
  return (
    <figure className="mt-4">
      <svg
        viewBox="0 0 600 330"
        role="img"
        aria-labelledby="static-map-title static-map-description"
        className="h-auto w-full rounded-xl border bg-slate-50"
      >
        <title id="static-map-title">Peta konfigurasi manual {overview.site.name}</title>
        <desc id="static-map-description">
          Visual tanpa tile eksternal. Daftar titik monitoring setelah peta adalah fallback
          authoritative yang dapat diakses.
        </desc>
        {zonesVisible &&
          overview.configuration.riskZones.map((zone) => (
            <polygon
              key={zone.featureId}
              points={(zone.geometry.coordinates[0] ?? []).map(project).join(' ')}
              fill="rgba(245, 158, 11, .20)"
              stroke="#b45309"
              strokeWidth="2"
            >
              <title>Zona referensi statis: {zone.name}</title>
            </polygon>
          ))}
        {routesVisible &&
          overview.configuration.evacuationRoutes.map((route) => (
            <polyline
              key={route.featureId}
              points={route.geometry.coordinates.map(project).join(' ')}
              fill="none"
              stroke="#2563eb"
              strokeWidth="4"
              strokeDasharray="8 4"
            >
              <title>Jalur evakuasi manual: {route.name}</title>
            </polyline>
          ))}
        {markersVisible &&
          overview.markers.map((marker) => {
            const risk = markerRisk(marker);
            const [x, y] = project(marker.position).split(' ');
            return (
              <g key={marker.monitoringPoint.id}>
                <title>
                  {marker.monitoringPoint.name}: {riskLabel(risk)}
                </title>
                <circle
                  cx={x}
                  cy={y}
                  r="10"
                  fill={riskColor(risk)}
                  stroke="#0f172a"
                  strokeWidth="2"
                />
                <text
                  x={Number(x) + 13}
                  y={Number(y) + 4}
                  className="fill-slate-950 text-[13px] font-semibold"
                >
                  {riskSymbol(risk)} {marker.monitoringPoint.name}
                </text>
              </g>
            );
          })}
      </svg>
      <figcaption className="mt-2 text-sm text-slate-600">
        Visual koordinat WGS84/EPSG:4326 tanpa provider peta. Gunakan daftar fallback untuk detail
        lengkap.
      </figcaption>
    </figure>
  );
}

function makeProjector(positions: readonly Position[]): (position: Position) => string {
  const longitudes = positions.map((position) => position[0]);
  const latitudes = positions.map((position) => position[1]);
  const minLon = Math.min(...longitudes, 0);
  const maxLon = Math.max(...longitudes, 1);
  const minLat = Math.min(...latitudes, 0);
  const maxLat = Math.max(...latitudes, 1);
  const lonRange = maxLon - minLon || 1;
  const latRange = maxLat - minLat || 1;
  return ([longitude, latitude]) =>
    `${40 + ((longitude - minLon) / lonRange) * 520} ${290 - ((latitude - minLat) / latRange) * 250}`;
}

function Legend() {
  return (
    <section aria-label="Legenda peta" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">Legenda</h3>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        <li>â— Aman</li>
        <li>â—† Waspada</li>
        <li>â–² Bahaya</li>
        <li>? Tidak dapat ditentukan</li>
        <li>â–§ Zona referensi statis</li>
        <li>â” Jalur evakuasi manual</li>
      </ul>
    </section>
  );
}

function FallbackList({ markers }: { readonly markers: MapOverview['markers'] }) {
  return (
    <section className="mt-4" aria-label="Daftar titik monitoring authoritative">
      <h3 className="font-semibold">Daftar titik monitoring</h3>
      <ul className="mt-2 space-y-2">
        {markers.map((marker) => {
          const risk = markerRisk(marker);
          return (
            <li key={marker.monitoringPoint.id} className="rounded-xl bg-slate-50 p-3">
              <strong>
                {riskSymbol(risk)} {marker.monitoringPoint.name}
              </strong>
              <p>
                Risiko: {riskLabel(risk)} Â· Konektivitas:{' '}
                {marker.currentState?.connectivityStatus ?? 'UNKNOWN'}
              </p>
              <p>Pembaruan terakhir: {marker.currentState?.lastTelemetryAt ?? 'Tidak tersedia'}</p>
              <p>
                Lokasi:{' '}
                {marker.monitoringPoint.locationDescription ?? 'Lokasi belum dideskripsikan'}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SopPanel({
  client,
  organizationId,
  siteId,
  role,
  activeDocument,
  history,
  hasMore,
  onChanged,
  onMore,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
  readonly role: Role;
  readonly activeDocument: SopDocument | null;
  readonly history: readonly SopDocument[];
  readonly hasMore: boolean;
  readonly onChanged: () => void;
  readonly onMore: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function upload(): Promise<void> {
    if (file === null) return;
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Pilih berkas PDF.');
      return;
    }
    if (file.size === 0 || file.size > maxBytes) {
      setError('Ukuran PDF harus lebih dari 0 dan maksimal 10 MiB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadSop(client, organizationId, siteId, file);
      setFile(null);
      onChanged();
    } catch {
      setError('Upload SOP belum berhasil.');
    } finally {
      setUploading(false);
    }
  }
  async function download(document: SopDocument): Promise<void> {
    setDownloading(document.id);
    setError(null);
    try {
      await downloadSop(client, organizationId, document);
    } catch {
      setError('SOP belum dapat diunduh. Periksa koneksi atau akses organisasi Anda.');
    } finally {
      setDownloading(null);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="font-bold">SOP resmi</h2>
      {activeDocument ? (
        <SopRow
          document={activeDocument}
          active
          downloading={downloading === activeDocument.id}
          onDownload={() => void download(activeDocument)}
        />
      ) : (
        <p className="mt-2">SOP resmi belum tersedia</p>
      )}
      {error !== null && (
        <p role="alert" className="error-banner mt-3">
          {error}
        </p>
      )}
      {role === 'PROJECT_OWNER' ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <label htmlFor="sop-file" className="block font-semibold">
            Unggah SOP PDF (maks. 10 MiB)
            <input
              id="sop-file"
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block"
            />
          </label>
          {file !== null && (
            <p className="mt-2 text-sm">
              Dipilih: {file.name} ({formatBytes(file.size)})
            </p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            Upload yang berhasil akan membuat versi baru menjadi aktif.
          </p>
          <button
            type="button"
            className="primary-button mt-2"
            disabled={file === null || uploading}
            onClick={() => void upload()}
          >
            {uploading ? 'Mengunggahâ€¦' : 'Konfirmasi unggah versi aktif'}
          </button>
        </div>
      ) : null}
      <h3 className="mt-5 font-semibold">Riwayat versi</h3>
      <ul className="mt-2 space-y-2">
        {history.map((document) => (
          <li key={document.id}>
            <SopRow
              document={document}
              downloading={downloading === document.id}
              onDownload={() => void download(document)}
            />
          </li>
        ))}
      </ul>
      {hasMore ? (
        <button type="button" className="secondary-button mt-3" onClick={onMore}>
          Muat lebih banyak
        </button>
      ) : null}
    </section>
  );
}

function SopRow({
  document,
  active = false,
  downloading,
  onDownload,
}: {
  readonly document: SopDocument;
  readonly active?: boolean;
  readonly downloading: boolean;
  readonly onDownload: () => void;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <p className="font-semibold">
        {document.originalFileName} {active ? '(aktif)' : ''}
      </p>
      <p>
        Versi {document.version} Â· {formatBytes(document.sizeBytes)} Â·{' '}
        {new Date(document.uploadedAt).toLocaleString('id-ID')}
      </p>
      <p>Diunggah oleh {document.uploadedBy.name}</p>
      <button
        type="button"
        className="secondary-button mt-2"
        disabled={downloading}
        onClick={onDownload}
      >
        {downloading ? 'Menyiapkan unduhanâ€¦' : 'Unduh SOP'}
      </button>
    </div>
  );
}

function MapConfigurationEditor({
  client,
  organizationId,
  siteId,
  onSaved,
}: {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly siteId: string;
  readonly onSaved: () => void;
}) {
  const [configuration, setConfiguration] = useState<MapConfiguration | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [centerLongitude, setCenterLongitude] = useState('');
  const [centerLatitude, setCenterLatitude] = useState('');
  const [zoom, setZoom] = useState('');
  const [locations, setLocations] = useState('[]');
  const [zones, setZones] = useState('[]');
  const [routes, setRoutes] = useState('[]');
  const [notes, setNotes] = useState('');
  async function openEditor(clearError = true): Promise<void> {
    setOpen(true);
    setLoading(true);
    if (clearError) setError(null);
    try {
      const result = await getMapConfiguration(client, organizationId, siteId);
      const value = result.data;
      setConfiguration(value);
      setCenterLongitude(value.center?.position[0].toString() ?? '');
      setCenterLatitude(value.center?.position[1].toString() ?? '');
      setZoom(value.center?.zoom.toString() ?? '');
      setLocations(JSON.stringify(value.monitoringPointLocations, null, 2));
      setZones(JSON.stringify(value.riskZones, null, 2));
      setRoutes(JSON.stringify(value.evacuationRoutes, null, 2));
      setNotes(value.notes ?? '');
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 404) {
        setConfiguration(null);
        setLocations('[]');
        setZones('[]');
        setRoutes('[]');
        setNotes('');
      } else setError('Konfigurasi peta belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }
  async function save(): Promise<void> {
    let monitoringPointLocations: MapConfiguration['monitoringPointLocations'];
    let riskZones: MapConfiguration['riskZones'];
    let evacuationRoutes: MapConfiguration['evacuationRoutes'];
    const longitude = Number(centerLongitude);
    const latitude = Number(centerLatitude);
    const centerIsEmpty =
      centerLongitude.trim() === '' && centerLatitude.trim() === '' && zoom.trim() === '';
    if (
      !centerIsEmpty &&
      (!isLongitude(longitude) || !isLatitude(latitude) || !Number.isFinite(Number(zoom)))
    ) {
      setError('Longitude harus -180 sampai 180, latitude -90 sampai 90, dan zoom harus angka.');
      return;
    }
    try {
      monitoringPointLocations = JSON.parse(
        locations,
      ) as MapConfiguration['monitoringPointLocations'];
      riskZones = JSON.parse(zones) as MapConfiguration['riskZones'];
      evacuationRoutes = JSON.parse(routes) as MapConfiguration['evacuationRoutes'];
    } catch {
      setError('Lokasi titik, zona, dan jalur harus berupa JSON valid sesuai kontrak GeoJSON.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await putMapConfiguration(client, organizationId, siteId, {
        expectedVersion: configuration?.version ?? null,
        center: centerIsEmpty ? null : { position: [longitude, latitude], zoom: Number(zoom) },
        monitoringPointLocations,
        riskZones,
        evacuationRoutes,
        notes: notes.trim() || null,
      });
      setConfiguration(result.data);
      setNotice(
        result.changed
          ? `Versi ${result.data.version} telah disimpan.`
          : `Tidak ada versi baru: konfigurasi identik (versi ${result.data.version}).`,
      );
      onSaved();
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.code === 'MAP_CONFIG_VERSION_CONFLICT') {
        setError(
          'Konfigurasi telah berubah. Data terbaru dimuat ulang; tinjau lalu kirim ulang secara manual.',
        );
        await openEditor(false);
      } else setError('Konfigurasi peta belum berhasil disimpan.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="font-bold">Editor konfigurasi peta</h2>
      <p className="mt-1 text-sm text-slate-600">
        Hanya Project Owner. Koordinat WGS84/EPSG:4326 selalu dikirim sebagai [longitude, latitude].
      </p>
      {!open ? (
        <button type="button" className="secondary-button mt-3" onClick={() => void openEditor()}>
          Buka editor
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          {loading ? (
            <p>Memuat konfigurasiâ€¦</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Longitude" value={centerLongitude} onChange={setCenterLongitude} />
                <Field label="Latitude" value={centerLatitude} onChange={setCenterLatitude} />
                <Field label="Zoom" value={zoom} onChange={setZoom} />
              </div>
              <JsonField
                id="monitoring-locations"
                label="Lokasi MonitoringPoint (JSON; posisi [longitude, latitude])"
                value={locations}
                onChange={setLocations}
              />
              <JsonField
                id="risk-zones"
                label="Risk-zone Polygon (JSON GeoJSON)"
                value={zones}
                onChange={setZones}
              />
              <JsonField
                id="evacuation-routes"
                label="Evacuation-route LineString (JSON GeoJSON)"
                value={routes}
                onChange={setRoutes}
              />
              <label className="block text-sm font-semibold">
                Catatan
                <textarea
                  className="field-input mt-1 min-h-20"
                  value={notes}
                  maxLength={2000}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? 'Menyimpanâ€¦' : 'Simpan konfigurasi'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                >
                  Batal
                </button>
              </div>
            </>
          )}
          {error !== null ? (
            <p role="alert" className="error-banner">
              {error}
            </p>
          ) : null}
          {notice !== null ? (
            <p role="status" className="text-sm font-semibold text-emerald-800">
              {notice}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = `map-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="block text-sm font-semibold">
      {label}
      <input
        id={id}
        inputMode="decimal"
        className="field-input mt-1 w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function JsonField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-semibold">
      {label}
      <textarea
        id={id}
        className="field-input mt-1 min-h-32 font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function markerRisk(
  marker: MapOverview['markers'][number],
): 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN' {
  const state = marker.currentState;
  return state === null ||
    state.connectivityStatus === 'OFFLINE' ||
    state.connectivityStatus === 'DELAYED'
    ? 'UNKNOWN'
    : state.serverRisk;
}
function riskLabel(risk: string): string {
  return risk === 'SAFE'
    ? 'Aman'
    : risk === 'WATCH'
      ? 'Waspada'
      : risk === 'DANGER'
        ? 'Bahaya'
        : 'Tidak dapat ditentukan';
}
function riskSymbol(risk: string): string {
  return risk === 'SAFE' ? 'â—' : risk === 'WATCH' ? 'â—†' : risk === 'DANGER' ? 'â–²' : '?';
}
function riskColor(risk: string): string {
  return risk === 'SAFE'
    ? '#16a34a'
    : risk === 'WATCH'
      ? '#d97706'
      : risk === 'DANGER'
        ? '#dc2626'
        : '#475569';
}
function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
function isLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}
function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(value < 1024 * 1024 ? 1 : 2)} MiB`;
}
