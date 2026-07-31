'use client';

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import type { OrganizationApiClient } from '../api/contracts';
import { ApiClientError } from '../auth/api-client';
import type { Role } from '../auth/auth-types';
import type { Site } from '../sites/site-contracts';
import { listSites } from '../sites/sites-api';
import { getRiskProfile, updateRiskProfile } from './risk-api';
import type { RiskProfile, TechnicalRange, UpdateRiskProfileInput } from './risk-contracts';
import { formatSiteTimestamp } from './risk-presentation';

interface Props {
  readonly client: OrganizationApiClient;
  readonly organizationId: string;
  readonly role: Role;
}

type RangeKey = keyof UpdateRiskProfileInput['technicalRanges'];

export function RiskProfileManager({ client, organizationId, role }: Props) {
  const [siteSearch, setSiteSearch] = useState('');
  const [sites, setSites] = useState<readonly Site[] | null>(null);
  const [siteError, setSiteError] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [draft, setDraft] = useState<UpdateRiskProfileInput | null>(null);
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [siteRetry, setSiteRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void listSites(client, organizationId, {
      ...(siteSearch.trim() === '' ? {} : { search: siteSearch.trim() }),
      limit: 100,
      sort: 'name:asc',
    })
      .then((response) => {
        if (active) setSites(response.data);
      })
      .catch(() => {
        if (active) {
          setSites([]);
          setSiteError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [client, organizationId, siteRetry, siteSearch]);

  useEffect(() => {
    let active = true;
    if (siteId === '')
      return () => {
        active = false;
      };
    void getRiskProfile(client, organizationId, siteId)
      .then((response) => {
        if (!active) return;
        setProfile(response.data);
        setDraft(toUpdateInput(response.data));
      })
      .catch((reason: unknown) => {
        if (active)
          setProfileError(reason instanceof Error ? reason : new Error('Profil gagal dimuat.'));
      });
    return () => {
      active = false;
    };
  }, [client, organizationId, siteId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || siteId === '' || !validDraft(draft)) {
      setFeedback('Periksa kembali nilai profil. Nilai numerik wajib berada pada rentang kontrak.');
      return;
    }
    if (!window.confirm('Buat versi profil aktif berdasarkan konfigurasi ini?')) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await updateRiskProfile(client, organizationId, siteId, draft);
      setProfile(response.data.profile);
      setDraft(toUpdateInput(response.data.profile));
      setFeedback(
        response.data.changed
          ? `Versi ${response.data.profile.version} berhasil dibuat dan diaktifkan.`
          : 'Tidak ada perubahan konfigurasi. Versi aktif tetap sama.',
      );
    } catch (reason) {
      setFeedback(profileErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div
        role="note"
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-900"
      >
        Profil ini masih bersifat sementara dan belum boleh dianggap sebagai ambang bencana final
        sebelum melalui kalibrasi ahli dan pengujian lapangan.
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <label className="block text-sm font-semibold text-slate-700">
          Cari Site
          <input
            className="field-input mt-1 max-w-md"
            value={siteSearch}
            maxLength={100}
            onChange={(event) => setSiteSearch(event.target.value)}
          />
        </label>
        {sites === null && (
          <p aria-live="polite" className="mt-3 text-sm text-slate-600">
            Memuat Site…
          </p>
        )}
        {siteError && (
          <div role="alert" className="error-banner mt-3">
            Daftar Site tidak dapat dimuat.
            <button
              type="button"
              className="secondary-button ml-3"
              onClick={() => setSiteRetry((value) => value + 1)}
            >
              Coba lagi
            </button>
          </div>
        )}
        {sites?.length === 0 && !siteError && (
          <p className="mt-3 text-sm text-slate-600">Site tidak ditemukan.</p>
        )}
        {sites !== null && sites.length > 0 && (
          <label className="mt-4 block max-w-md text-sm font-semibold text-slate-700">
            Site aktif
            <select
              aria-label="Pilih Site untuk profil risiko"
              className="field-input mt-1"
              value={siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
                setProfile(null);
                setDraft(null);
                setProfileError(null);
                setFeedback(null);
              }}
            >
              <option value="">Pilih Site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      {siteId !== '' && profile === null && profileError === null && (
        <p aria-live="polite">Memuat profil risiko…</p>
      )}
      {profileError !== null && (
        <div role="alert" className="error-banner">
          Profil risiko tidak dapat dimuat.
          {profileError instanceof ApiClientError && profileError.requestId !== undefined && (
            <p className="text-xs">Request ID: {profileError.requestId}</p>
          )}
        </div>
      )}
      {profile !== null && draft !== null && (
        <form
          onSubmit={save}
          className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6"
        >
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Profil risiko versi {profile.version}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Aktif sejak{' '}
                {formatSiteTimestamp(
                  profile.activatedAt,
                  sites?.find((site) => site.id === siteId)?.timezone ?? 'Asia/Jakarta',
                )}
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
              Kalibrasi: {profile.calibrationStatus}
            </span>
          </header>
          <p className="text-xs text-slate-500">
            Calibration status bersifat read-only. Dibuat{' '}
            {formatSiteTimestamp(
              profile.createdAt,
              sites?.find((site) => site.id === siteId)?.timezone ?? 'Asia/Jakarta',
            )}
            .
          </p>
          <fieldset disabled={role !== 'PROJECT_OWNER'} className="contents">
            <ProfileSection title="Ambang Aman">
              <NumberField
                label="Kemiringan kurang dari (°)"
                value={draft.thresholds.safe.tiltMagnitudeDegLt}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    thresholds: {
                      ...draft.thresholds,
                      safe: { ...draft.thresholds.safe, tiltMagnitudeDegLt: value },
                    },
                  })
                }
              />
              <NumberField
                label="Kelembapan kurang dari (%)"
                value={draft.thresholds.safe.soilMoisturePctLt}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    thresholds: {
                      ...draft.thresholds,
                      safe: { ...draft.thresholds.safe, soilMoisturePctLt: value },
                    },
                  })
                }
              />
              <NumberField
                label="Curah hujan kurang dari (mm/jam)"
                value={draft.thresholds.safe.rainfallMmHourLt}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    thresholds: {
                      ...draft.thresholds,
                      safe: { ...draft.thresholds.safe, rainfallMmHourLt: value },
                    },
                  })
                }
              />
            </ProfileSection>
            <ProfileSection title="Ambang Bahaya">
              {(
                [
                  ['Kemiringan lebih dari (°)', 'tiltMagnitudeDegGt'],
                  ['Curah hujan lebih dari (mm/jam)', 'rainfallMmHourGt'],
                  ['Kelembapan lebih dari (%)', 'soilMoisturePctGt'],
                ] as const
              ).map(([label, key]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={draft.thresholds.danger[key]}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      thresholds: {
                        ...draft.thresholds,
                        danger: { ...draft.thresholds.danger, [key]: value },
                      },
                    })
                  }
                />
              ))}
            </ProfileSection>
            <ProfileSection title="Freshness dan hysteresis">
              {(
                [
                  ['Terhubung dalam (menit)', 'onlineWithinMinutes'],
                  ['Offline setelah (menit)', 'offlineAfterMinutes'],
                ] as const
              ).map(([label, key]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={draft.freshness[key]}
                  step={1}
                  onChange={(value) =>
                    setDraft({ ...draft, freshness: { ...draft.freshness, [key]: value } })
                  }
                />
              ))}
              {(
                [
                  ['Sampel Waspada berturut-turut', 'watchConsecutiveSamples'],
                  ['Sampel Bahaya berturut-turut', 'dangerConsecutiveSamples'],
                  ['Stabil sebelum downgrade (menit)', 'downgradeStableMinutes'],
                  ['Mismatch berturut-turut', 'mismatchConsecutiveSamples'],
                ] as const
              ).map(([label, key]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={draft.hysteresis[key]}
                  step={1}
                  onChange={(value) =>
                    setDraft({ ...draft, hysteresis: { ...draft.hysteresis, [key]: value } })
                  }
                />
              ))}
            </ProfileSection>
            <details className="rounded-2xl border border-slate-200 p-4">
              <summary className="cursor-pointer font-bold text-slate-900">
                Rentang teknis sensor
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(Object.keys(draft.technicalRanges) as RangeKey[]).map((key) => (
                  <RangeFields
                    key={key}
                    name={key}
                    value={draft.technicalRanges[key]}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        technicalRanges: { ...draft.technicalRanges, [key]: value },
                      })
                    }
                  />
                ))}
              </div>
            </details>
            <label className="block text-sm font-semibold text-slate-700">
              Catatan
              <textarea
                className="field-input mt-1 min-h-28"
                maxLength={2000}
                value={draft.notes ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    notes: event.target.value === '' ? null : event.target.value,
                  })
                }
              />
            </label>
          </fieldset>
          {feedback !== null && (
            <p
              role="status"
              className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900"
            >
              {feedback}
            </p>
          )}
          {role === 'PROJECT_OWNER' ? (
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan sebagai versi baru'}
            </button>
          ) : (
            <p className="text-sm text-slate-600">Admin Sekolah memiliki akses baca saja.</p>
          )}
        </form>
      )}
    </div>
  );
}

function RangeFields({
  name,
  value,
  onChange,
}: {
  readonly name: RangeKey;
  readonly value: TechnicalRange;
  readonly onChange: (value: TechnicalRange) => void;
}) {
  return (
    <fieldset className="rounded-xl bg-slate-50 p-3">
      <legend className="px-1 text-xs font-bold text-slate-700">{rangeLabel(name)}</legend>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Minimum"
          value={value.minimum}
          onChange={(minimum) => onChange({ ...value, minimum })}
        />
        <label className="text-xs font-semibold text-slate-600">
          Maksimum
          <input
            className="field-input mt-1"
            type="number"
            step="any"
            value={value.maximum ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                maximum: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </fieldset>
  );
}

function ProfileSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3">
      <legend className="px-2 font-bold text-slate-900">{title}</legend>
      {children}
    </fieldset>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 'any',
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly step?: number | 'any';
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        className="field-input mt-1"
        type="number"
        required
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function toUpdateInput(profile: RiskProfile): UpdateRiskProfileInput {
  return {
    calibrationStatus: profile.calibrationStatus,
    thresholds: structuredClone(profile.thresholds),
    technicalRanges: structuredClone(profile.technicalRanges),
    freshness: structuredClone(profile.freshness),
    hysteresis: structuredClone(profile.hysteresis),
    notes: profile.notes,
  };
}

function validDraft(input: UpdateRiskProfileInput): boolean {
  const values = [
    input.thresholds.safe.tiltMagnitudeDegLt,
    input.thresholds.safe.soilMoisturePctLt,
    input.thresholds.safe.rainfallMmHourLt,
    input.thresholds.danger.tiltMagnitudeDegGt,
    input.thresholds.danger.rainfallMmHourGt,
    input.thresholds.danger.soilMoisturePctGt,
  ];
  const integers = [...Object.values(input.freshness), ...Object.values(input.hysteresis)];
  return (
    values.every(Number.isFinite) &&
    input.thresholds.safe.tiltMagnitudeDegLt > 0 &&
    input.thresholds.safe.tiltMagnitudeDegLt <= 180 &&
    input.thresholds.safe.soilMoisturePctLt > 0 &&
    input.thresholds.safe.soilMoisturePctLt <= 100 &&
    input.thresholds.safe.rainfallMmHourLt > 0 &&
    input.thresholds.danger.tiltMagnitudeDegGt >= 0 &&
    input.thresholds.danger.tiltMagnitudeDegGt <= 180 &&
    input.thresholds.danger.soilMoisturePctGt >= 0 &&
    input.thresholds.danger.soilMoisturePctGt <= 100 &&
    input.thresholds.danger.rainfallMmHourGt >= 0 &&
    integers.every((value) => Number.isInteger(value)) &&
    input.freshness.onlineWithinMinutes >= 1 &&
    input.freshness.offlineAfterMinutes >= 2 &&
    input.hysteresis.watchConsecutiveSamples >= 1 &&
    input.hysteresis.dangerConsecutiveSamples >= 1 &&
    input.hysteresis.downgradeStableMinutes >= 0 &&
    input.hysteresis.mismatchConsecutiveSamples >= 1 &&
    Object.values(input.technicalRanges).every(
      (range) =>
        Number.isFinite(range.minimum) &&
        (range.maximum === null ||
          (Number.isFinite(range.maximum) && range.maximum >= range.minimum)),
    ) &&
    (input.notes === null || input.notes.length <= 2000)
  );
}

function profileErrorMessage(reason: unknown): string {
  if (!(reason instanceof ApiClientError)) return 'Profil risiko tidak dapat disimpan.';
  if (reason.status === 403) return 'Anda tidak memiliki izin untuk mengubah profil risiko.';
  if (reason.status === 404) return 'Site atau profil risiko tidak ditemukan.';
  if (reason.status === 400) return 'Konfigurasi ditolak. Periksa kembali seluruh nilai.';
  return 'Profil risiko tidak dapat disimpan.';
}

function rangeLabel(key: RangeKey): string {
  return {
    tiltXDeg: 'Kemiringan X (°)',
    tiltYDeg: 'Kemiringan Y (°)',
    tiltMagnitudeDeg: 'Magnitudo kemiringan (°)',
    soilMoisturePct: 'Kelembapan tanah (%)',
    rainfallMmHour: 'Curah hujan (mm/jam)',
    batteryVoltage: 'Tegangan baterai (V)',
    signalRssi: 'Signal RSSI (dBm)',
  }[key];
}
