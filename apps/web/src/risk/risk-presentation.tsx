import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ConnectivityStatus,
  RiskLevel,
  RiskReason,
} from './risk-contracts';

const riskPresentation: Record<RiskLevel, { label: string; icon: string; classes: string }> = {
  SAFE: { label: 'Aman', icon: '✓', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  WATCH: { label: 'Waspada', icon: '!', classes: 'bg-amber-50 text-amber-900 border-amber-200' },
  DANGER: { label: 'Bahaya', icon: '⚠', classes: 'bg-red-50 text-red-800 border-red-200' },
  UNKNOWN: {
    label: 'Tidak dapat ditentukan',
    icon: '?',
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

export function RiskBadge({ value }: { readonly value: RiskLevel }) {
  const presentation = riskPresentation[value];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${presentation.classes}`}
    >
      <span aria-hidden="true">{presentation.icon}</span>
      {presentation.label}
    </span>
  );
}

export function riskLabel(value: RiskLevel): string {
  return riskPresentation[value].label;
}

export function connectivityLabel(value: ConnectivityStatus): string {
  return {
    ONLINE: 'Terhubung',
    DELAYED: 'Data terlambat',
    OFFLINE: 'Tidak terhubung',
    UNKNOWN: 'Status koneksi tidak diketahui',
  }[value];
}

export function reasonLabel(value: RiskReason): string {
  return {
    SAFE_THRESHOLDS_MET: 'Seluruh kondisi aman terpenuhi.',
    WATCH_THRESHOLDS_MET: 'Kondisi memerlukan kewaspadaan.',
    DANGER_TILT: 'Kemiringan melewati ambang bahaya.',
    DANGER_RAIN_MOISTURE: 'Curah hujan dan kelembapan melewati ambang bahaya.',
    REQUIRED_SENSOR_MISSING: 'Data sensor yang diperlukan belum tersedia.',
    REQUIRED_SENSOR_INVALID: 'Data sensor tidak valid.',
    DEVICE_DISABLED: 'Perangkat dinonaktifkan.',
    TELEMETRY_DELAYED: 'Data telemetry terlambat.',
    DEVICE_OFFLINE: 'Perangkat tidak terhubung.',
    TIMESTAMP_UNTRUSTED: 'Waktu pengukuran tidak dapat dipercaya.',
    PROFILE_UNAVAILABLE: 'Profil risiko belum tersedia.',
    DEVICE_SERVER_MISMATCH: 'Penilaian perangkat berbeda dari hasil server.',
    WATCH_HYSTERESIS_PENDING: 'Menunggu sampel Waspada berikutnya.',
    DOWNGRADE_STABILITY_PENDING: 'Menunggu kondisi stabil sebelum penurunan status.',
  }[value];
}

export function alertTypeLabel(value: AlertType): string {
  return {
    RISK_WATCH: 'Risiko Waspada',
    RISK_DANGER: 'Risiko Bahaya',
    DEVICE_DELAYED: 'Data perangkat terlambat',
    DEVICE_OFFLINE: 'Perangkat tidak terhubung',
    DEVICE_SERVER_MISMATCH: 'Perbedaan penilaian perangkat/server',
  }[value];
}

export function severityLabel(value: AlertSeverity): string {
  return { INFO: 'Informasi', WARNING: 'Peringatan', CRITICAL: 'Kritis' }[value];
}

export function alertStatusLabel(value: AlertStatus): string {
  return {
    ACTIVE: 'Aktif — belum ditangani',
    ACKNOWLEDGED: 'Diketahui',
    RESOLVED: 'Selesai',
    FALSE_ALARM: 'Alarm palsu',
  }[value];
}

export function formatSiteTimestamp(value: string | null, timezone: string): string {
  if (value === null) return 'Belum tersedia';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return 'Waktu tidak valid';
  }
}
