import type { ApiErrorEnvelope, DataEnvelope, ListEnvelope } from '../src/api/contracts';
import type {
  Device,
  RegisterDeviceResponse,
  RotateCredentialResponse,
} from '../src/devices/device-contracts';
import type { MonitoringPoint } from '../src/monitoring-points/monitoring-point-contracts';
import type { Site } from '../src/sites/site-contracts';

export const siteFixture: Site = {
  id: 'site_01K1B6H3QAK8N0P4U6W9Y1Z3BC',
  name: 'SMAN 17 Bandar Lampung',
  address: null,
  timezone: 'Asia/Jakarta',
};

export const siteListFixture: ListEnvelope<Site> = {
  data: [siteFixture],
  page: { nextCursor: null, hasMore: false },
};

export const monitoringPointFixture: MonitoringPoint = {
  id: 'mp_01K1B6JZTHB7M8Q9K2R4V6W8XY',
  organizationId: 'org_01K1B6G2PZJ7K9M3T5V8X0Y2AB',
  siteId: siteFixture.id,
  name: 'Lereng Belakang Gedung Utama',
  description: 'Titik pemantauan awal di area lereng sekolah.',
  locationDescription: 'Sebelah utara gedung utama.',
  isActive: true,
  currentDevice: {
    id: 'dev_01K1B6K4RBM9P1Q5V7X0Z2A4CD',
    hardwareId: 'SMAN17-LS-001',
    displayName: 'Perangkat Lereng Utara',
    lifecycleStatus: 'ENABLED',
    lastSeenAt: '2026-07-30T07:59:01.120Z',
  },
  createdAt: '2026-07-29T01:15:00.000Z',
  updatedAt: '2026-07-30T07:59:01.120Z',
};

export const monitoringPointListFixture: ListEnvelope<MonitoringPoint> = {
  data: [monitoringPointFixture],
  page: { nextCursor: null, hasMore: false },
};

export const deviceFixture: Device = {
  id: 'dev_01K1B6K4RBM9P1Q5V7X0Z2A4CD',
  organizationId: monitoringPointFixture.organizationId,
  siteId: monitoringPointFixture.siteId,
  monitoringPointId: monitoringPointFixture.id,
  hardwareId: 'SMAN17-LS-001',
  displayName: 'Perangkat Lereng Utara',
  lifecycleStatus: 'ENABLED',
  firmwareVersion: null,
  lastSeenAt: null,
  lastTelemetryAt: null,
  lastNetwork: null,
  disabledAt: null,
  createdAt: '2026-07-30T08:00:00.000Z',
  updatedAt: '2026-07-30T08:00:00.000Z',
};

export const deviceListFixture: ListEnvelope<Device> = {
  data: [deviceFixture],
  page: { nextCursor: null, hasMore: false },
};

export const deviceDetailFixture: DataEnvelope<Device> = {
  data: deviceFixture,
};

export const deviceRegisterFixture: RegisterDeviceResponse = {
  data: {
    device: deviceFixture,
    credential: {
      scheme: 'Device',
      hardwareId: deviceFixture.hardwareId,
      secret: 'TEST_ONLY_NOT_A_REAL_DEVICE_CREDENTIAL_000001',
      issuedAt: '2026-07-30T08:00:00.000Z',
      displayOnce: true,
    },
  },
};

export const rotateCredentialFixture: RotateCredentialResponse = {
  data: {
    device: {
      ...deviceFixture,
      updatedAt: '2026-07-30T09:00:00.000Z',
    },
    credential: {
      scheme: 'Device',
      hardwareId: deviceFixture.hardwareId,
      secret: 'TEST_ONLY_NOT_A_REAL_DEVICE_CREDENTIAL_000002',
      issuedAt: '2026-07-30T09:00:00.000Z',
      displayOnce: true,
    },
  },
};

export const validationErrorFixture: ApiErrorEnvelope = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Payload tidak valid.',
    details: [
      {
        field: 'readings.soilMoisturePct',
        messages: ['Harus bernilai antara 0 dan 100.'],
      },
    ],
  },
  requestId: 'req_01K1B6JZTHB7M8Q9K2R4V6W8XY',
  timestamp: '2026-07-30T08:00:00.000Z',
};
