import type { AppConfig } from '../config/app-config.js';
import { nationalWarningLevelByRisk } from '../risk/national-warning-level.js';
import type { ServerRisk } from '../risk/risk-engine.types.js';
import type { RiskTransitionNotificationPayload } from './notification.types.js';

const reasonLabels: Readonly<Record<string, string>> = {
  SAFE_THRESHOLDS_MET: 'Seluruh pembacaan valid berada di bawah ambang Waspada',
  WATCH_THRESHOLDS_MET: 'Satu atau lebih pembacaan mencapai ambang Waspada (Tingkat 1)',
  WARNING_TILT: 'Kemiringan mencapai ambang Siaga (Tingkat 2)',
  WARNING_RAINFALL: 'Curah hujan mencapai ambang Siaga (Tingkat 2)',
  WARNING_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang Siaga (Tingkat 2)',
  DANGER_RAIN_TILT: 'Kombinasi kemiringan dan curah hujan mencapai tingkat Awas',
  DANGER_TILT: 'Kemiringan mencapai ambang Awas (Tingkat 3)',
  DANGER_RAIN_MOISTURE: 'Kombinasi hujan dan kelembapan mencapai tingkat Awas',
  DANGER_RAINFALL: 'Curah hujan mencapai ambang Awas (Tingkat 3)',
  DANGER_PROLONGED_RAINFALL: 'Hujan berlanjut setelah beberapa hari hujan sedang',
  DANGER_SOIL_MOISTURE: 'Kelembapan tanah mencapai ambang Awas (Tingkat 3)',
  REQUIRED_SENSOR_MISSING: 'Pembacaan sensor wajib tidak tersedia',
  REQUIRED_SENSOR_INVALID: 'Pembacaan sensor wajib berada di luar rentang teknis',
  DEVICE_DISABLED: 'Perangkat dinonaktifkan',
  TELEMETRY_DELAYED: 'Telemetri terlambat diterima',
  DEVICE_OFFLINE: 'Perangkat tidak terhubung',
  TIMESTAMP_UNTRUSTED: 'Waktu perangkat tidak dapat dipercaya',
  PROFILE_UNAVAILABLE: 'Profil risiko aktif tidak tersedia',
  DEVICE_SERVER_MISMATCH: 'Status firmware berbeda dengan perhitungan server',
  WATCH_HYSTERESIS_PENDING: 'Konfirmasi kondisi Waspada masih berlangsung',
  DOWNGRADE_STABILITY_PENDING: 'Stabilitas penurunan tingkat masih dipantau',
};

export function formatTelegramRiskMessage(
  payload: RiskTransitionNotificationPayload,
  config: AppConfig['telegram'],
): string {
  const current = nationalWarningLevelByRisk[payload.currentStatus].displayLabel;
  const previous = nationalWarningLevelByRisk[payload.previousStatus].displayLabel;
  const reasons = payload.reasons.length === 0 ? ['Alasan tidak tersedia'] : payload.reasons;
  const lines = [
    `${statusIcon(payload.currentStatus)} TEKNILA SIAGA LONGSOR — ${current}`,
    '',
    `Status: ${previous} → ${current}`,
    `Lokasi: ${payload.siteName} / ${payload.monitoringPointName}`,
    `Waktu: ${formatLocalTimestamp(payload.occurredAt, payload.siteTimezone)}`,
    'Skema: Aman → Waspada (Tingkat 1) → Siaga (Tingkat 2) → Awas (Tingkat 3)',
    '',
    'Penyebab:',
    ...reasons.map((reason) => `• ${reasonLabels[reason] ?? reason}`),
    '',
    'Data sensor:',
    `• Kemiringan: ${formatReading(payload.sensorSnapshot.tiltMagnitudeDeg, '°', 2)}`,
    `• Kelembapan tanah: ${formatReading(payload.sensorSnapshot.soilMoisturePct, '%', 2)}`,
    `• Curah hujan: ${formatReading(payload.sensorSnapshot.rainfallMmHour, 'mm/jam', 2)}`,
  ];

  if (payload.rainfallDuration !== null) {
    lines.push(
      `• Durasi hujan sedang: ${payload.rainfallDuration.consecutiveModerateDays} hari berturut-turut`,
    );
  }

  lines.push('', actionFor(payload.currentStatus), '', `Dashboard: ${config.dashboardUrl}`);
  lines.push(`ID kejadian: ${payload.eventId}`);
  return lines.join('\n');
}

function statusIcon(status: ServerRisk): string {
  if (status === 'DANGER') return '🚨';
  if (status === 'WARNING') return '⚠️';
  if (status === 'WATCH') return '🟡';
  if (status === 'SAFE') return '✅';
  return '⚫';
}

function actionFor(status: ServerRisk): string {
  if (status === 'DANGER') {
    return 'AWAS: segera hubungi tim siaga/otoritas dan jalankan komando evakuasi sesuai prosedur tetap resmi.';
  }
  if (status === 'WARNING') {
    return 'SIAGA: tingkatkan pemantauan, lakukan verifikasi lapangan, dan siapkan pelaksanaan prosedur evakuasi.';
  }
  if (status === 'WATCH') {
    return 'WASPADA: tingkatkan perhatian pada perubahan sensor dan lakukan pemeriksaan lapangan sesuai prosedur.';
  }
  if (status === 'UNKNOWN') {
    return 'Status ini bukan kondisi aman. Periksa perangkat, koneksi, dan pembacaan sensor.';
  }
  return 'AMAN: pembacaan berada di bawah ambang Waspada. Tetap lakukan pemantauan rutin.';
}

function formatReading(value: number | null, unit: string, maximumFractionDigits: number): string {
  if (value === null) return 'tidak tersedia';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(value)} ${unit}`;
}

function formatLocalTimestamp(value: string, timeZone: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'long',
      timeStyle: 'medium',
      timeZone,
    }).format(timestamp);
  } catch {
    return timestamp.toISOString();
  }
}
