'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import type { MonitoringPoint } from '../monitoring-points/monitoring-point-contracts';
import { formatTimestamp } from '../monitoring-points/monitoring-point-detail-dialog';
import { TextField } from '../monitoring-points/monitoring-point-form-dialog';
import { SiteLookupField } from '../monitoring-points/site-lookup-field';
import type { Site } from '../sites/site-contracts';
import type { Device, DeviceCredentialData } from './device-contracts';
import { disableDevice, getDevice, rotateDeviceCredential, updateDevice } from './devices-api';
import { safeMutationError, validationDetails } from './device-register-dialog';
import { MonitoringPointLookupField } from './monitoring-point-lookup-field';

interface DeviceDetailDialogProps {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly deviceId: string;
  readonly role: Role;
  readonly sites: readonly Site[];
  readonly monitoringPoints: readonly MonitoringPoint[];
  onClose(): void;
  onChanged(message: string): void;
  onCredential(data: DeviceCredentialData): void;
}

interface DetailState {
  readonly key: string;
  readonly status: 'ready' | 'error';
  readonly device?: Device;
  readonly error?: Error;
}

type Confirmation = 'rotate' | 'disable' | null;

export function DeviceDetailDialog({
  client,
  organizationId,
  deviceId,
  role,
  sites,
  monitoringPoints,
  onClose,
  onChanged,
  onCredential,
}: DeviceDetailDialogProps) {
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [monitoringPointId, setMonitoringPointId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    readonly displayName?: string;
    readonly monitoringPointId?: string;
  }>({});
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const key = `${organizationId}\u0000${deviceId}\u0000${retry}`;
  const current = detail?.key === key ? detail : null;
  const device = current?.device;

  useEffect(() => {
    let active = true;
    void getDevice(client, organizationId, deviceId)
      .then((response) => {
        if (!active) return;
        setDetail({ key, status: 'ready', device: response.data });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDetail({
          key,
          status: 'error',
          error:
            reason instanceof Error ? reason : new Error('Detail perangkat tidak dapat dimuat.'),
        });
      });
    return () => {
      active = false;
    };
  }, [client, deviceId, key, organizationId]);

  const site = sites.find((candidate) => candidate.id === device?.siteId);
  const point = monitoringPoints.find((candidate) => candidate.id === device?.monitoringPointId);

  function beginEdit(): void {
    if (device === undefined) return;
    setDisplayName(device.displayName);
    setSiteId(device.siteId);
    setMonitoringPointId(device.monitoringPointId);
    setFieldErrors({});
    setGlobalError(null);
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedName = displayName.trim();
    const errors = {
      ...(normalizedName.length === 0
        ? { displayName: 'Nama perangkat wajib diisi.' }
        : normalizedName.length > 120
          ? { displayName: 'Nama perangkat maksimal 120 karakter.' }
          : {}),
      ...(monitoringPointId.length === 0
        ? { monitoringPointId: 'Titik monitoring wajib dipilih.' }
        : {}),
    };
    setFieldErrors(errors);
    setGlobalError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await updateDevice(client, organizationId, deviceId, {
        displayName: normalizedName,
        monitoringPointId,
      });
      onChanged('Data perangkat tersimpan.');
    } catch (reason) {
      const error = reason instanceof ApiClientError ? reason : null;
      setFieldErrors(validationDetails(error?.details));
      setGlobalError(safeMutationError(error, 'Perangkat tidak dapat diperbarui.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function executeConfirmation(): Promise<void> {
    if (confirmation === null) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      if (confirmation === 'rotate') {
        const response = await rotateDeviceCredential(client, organizationId, deviceId);
        onCredential(response.data);
      } else {
        await disableDevice(client, organizationId, deviceId);
        onChanged('Perangkat berada dalam status dinonaktifkan. Histori telemetry tetap tersedia.');
      }
    } catch (reason) {
      const error = reason instanceof ApiClientError ? reason : null;
      setConfirmation(null);
      setGlobalError(safeMutationError(error, 'Tindakan perangkat gagal diproses.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation !== null) {
    const rotating = confirmation === 'rotate';
    return (
      <div className="dialog-backdrop" role="presentation">
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="device-confirmation-title"
          aria-describedby="device-confirmation-description"
          className="dialog-panel max-w-lg"
        >
          <h2 id="device-confirmation-title" className="text-xl font-bold text-slate-950">
            {rotating ? 'Rotasi credential perangkat?' : 'Nonaktifkan perangkat?'}
          </h2>
          <p id="device-confirmation-description" className="mt-3 text-sm leading-6 text-slate-600">
            {rotating
              ? 'Secret lama segera tidak berlaku setelah rotasi berhasil. Perangkat harus dikonfigurasi ulang dan secret baru hanya ditampilkan satu kali.'
              : 'Perangkat tidak dihapus dan histori telemetry tetap tersedia. Credential tidak dapat lagi digunakan setelah transisi lifecycle ini.'}
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmation(null)}
              className="secondary-button"
              autoFocus
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void executeConfirmation()}
              className={rotating ? 'primary-button' : 'danger-button'}
            >
              {submitting ? 'Memproses…' : rotating ? 'Ya, rotasi credential' : 'Ya, nonaktifkan'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-detail-title"
        className="dialog-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
              Detail perangkat
            </p>
            <h2 id="device-detail-title" className="mt-1 text-xl font-bold text-slate-950">
              {device?.displayName ?? 'Memuat detail…'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail perangkat"
            className="icon-button"
            autoFocus
          >
            ×
          </button>
        </div>

        {globalError !== null && (
          <div className="error-banner mt-6" role="alert">
            {globalError}
          </div>
        )}
        {current === null && (
          <p role="status" aria-live="polite" className="mt-6 text-sm text-slate-600">
            Memuat detail perangkat…
          </p>
        )}
        {current?.status === 'error' && (
          <div className="error-banner mt-6" role="alert">
            <p>Detail perangkat tidak dapat dimuat.</p>
            {current.error instanceof ApiClientError && current.error.requestId !== undefined && (
              <p className="mt-1 text-xs">Request ID: {current.error.requestId}</p>
            )}
            <button
              type="button"
              onClick={() => setRetry((number) => number + 1)}
              className="mt-2 font-bold underline"
            >
              Coba lagi
            </button>
          </div>
        )}
        {device !== undefined && editing && (
          <form className="mt-6 space-y-5" onSubmit={(event) => void save(event)} noValidate>
            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-800">Hardware ID</span>
              <p className="rounded-xl bg-slate-100 px-4 py-3 font-mono text-sm text-slate-700">
                {device.hardwareId}
              </p>
            </div>
            <TextField
              id="edit-device-display-name"
              label="Nama perangkat"
              value={displayName}
              maxLength={120}
              error={fieldErrors.displayName}
              onChange={setDisplayName}
            />
            <SiteLookupField
              client={client}
              organizationId={organizationId}
              value={siteId}
              onChange={(nextSiteId) => {
                setSiteId(nextSiteId);
                setMonitoringPointId('');
              }}
            />
            <MonitoringPointLookupField
              client={client}
              organizationId={organizationId}
              siteId={siteId}
              value={monitoringPointId}
              error={fieldErrors.monitoringPointId}
              idPrefix="edit-device"
              onChange={setMonitoringPointId}
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(false)} className="secondary-button">
                Batal
              </button>
              <button type="submit" disabled={submitting} className="primary-button">
                {submitting ? 'Menyimpan…' : 'Simpan perubahan'}
              </button>
            </div>
          </form>
        )}
        {device !== undefined && !editing && (
          <>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Hardware ID" value={device.hardwareId} mono />
              <DetailItem
                label="Status lifecycle"
                value={formatLifecycle(device.lifecycleStatus)}
              />
              <DetailItem label="Site" value={site?.name ?? device.siteId} />
              <DetailItem
                label="Titik monitoring"
                value={point?.name ?? device.monitoringPointId}
              />
              <DetailItem label="Firmware" value={device.firmwareVersion ?? 'Belum tersedia'} />
              <DetailItem label="Terakhir terlihat" value={formatTimestamp(device.lastSeenAt)} />
              <DetailItem
                label="Telemetry terakhir"
                value={formatTimestamp(device.lastTelemetryAt)}
              />
              <DetailItem
                label="Jaringan terakhir"
                value={
                  device.lastNetwork === null
                    ? 'Belum tersedia'
                    : `${formatNetwork(device.lastNetwork.type)}; RSSI ${device.lastNetwork.signalRssi ?? 'belum tersedia'}`
                }
              />
              <DetailItem label="Dinonaktifkan" value={formatTimestamp(device.disabledAt)} />
              <DetailItem label="Dibuat" value={formatTimestamp(device.createdAt)} />
              <DetailItem label="Diperbarui" value={formatTimestamp(device.updatedAt)} />
            </dl>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={onClose} className="secondary-button">
                Tutup
              </button>
              {role === 'PROJECT_OWNER' && (
                <>
                  <button type="button" onClick={beginEdit} className="secondary-button">
                    Edit
                  </button>
                  {device.lifecycleStatus === 'ENABLED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmation('rotate')}
                        className="secondary-button"
                      >
                        Rotasi credential
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmation('disable')}
                        className="danger-button"
                      >
                        Nonaktifkan
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

export function formatLifecycle(status: Device['lifecycleStatus']): string {
  return status === 'ENABLED' ? 'Aktif' : 'Dinonaktifkan';
}

export function formatNetwork(type: NonNullable<Device['lastNetwork']>['type']): string {
  if (type === 'WIFI') return 'Wi-Fi';
  if (type === 'CELLULAR') return 'Seluler';
  return 'Tidak diketahui';
}
