import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  DeviceLifecycleStatus,
  FirmwareRiskLevel,
  NetworkType,
} from '../generated/prisma/enums.js';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL wajib tersedia untuk domain foundation integration test.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

describe('Phase 02 database and domain foundation', () => {
  const testRunId = randomUUID();
  const organizationId = `domain-org-${testRunId}`;
  const siteId = `domain-site-${testRunId}`;
  const monitoringPointId = `domain-point-${testRunId}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Domain Foundation Test Organization',
        slug: `domain-${testRunId}`,
      },
    });
    await prisma.site.create({
      data: {
        id: siteId,
        name: 'Domain Foundation Test Site',
        organizationId,
        slug: `domain-site-${testRunId}`,
      },
    });
    await prisma.monitoringPoint.create({
      data: {
        id: monitoringPointId,
        name: 'Domain Foundation Test Point',
        organizationId,
        siteId,
      },
    });
  });

  afterAll(async () => {
    await prisma.telemetry.deleteMany({ where: { device: { organizationId } } });
    await prisma.device.deleteMany({ where: { organizationId } });
    await prisma.monitoringPoint.deleteMany({ where: { organizationId } });
    await prisma.site.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('rejects a monitoring point whose site belongs to another organization', async () => {
    const otherOrganizationId = `domain-other-org-${testRunId}`;
    await prisma.organization.create({
      data: {
        id: otherOrganizationId,
        name: 'Other Domain Test Organization',
        slug: `domain-other-${testRunId}`,
      },
    });

    try {
      await expect(
        prisma.monitoringPoint.create({
          data: {
            name: 'Invalid Cross-Organization Point',
            organizationId: otherOrganizationId,
            siteId,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    } finally {
      await prisma.organization.delete({ where: { id: otherOrganizationId } });
    }
  });

  it('enforces global hardwareId uniqueness', async () => {
    const hardwareId = hardware('UNIQUE');
    await createDevice({ hardwareId, lifecycleStatus: DeviceLifecycleStatus.DISABLED });

    await expect(
      createDevice({
        hardwareId,
        lifecycleStatus: DeviceLifecycleStatus.DISABLED,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows only one enabled device per monitoring point', async () => {
    const point = await createMonitoringPoint('single-enabled');
    await createDevice({
      hardwareId: hardware('ENABLED-A'),
      monitoringPointId: point.id,
    });

    await expect(
      createDevice({
        hardwareId: hardware('ENABLED-B'),
        monitoringPointId: point.id,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows a replacement after the previous device is disabled', async () => {
    const point = await createMonitoringPoint('replacement');
    await createDevice({
      hardwareId: hardware('DISABLED'),
      lifecycleStatus: DeviceLifecycleStatus.DISABLED,
      monitoringPointId: point.id,
    });

    const replacement = await createDevice({
      hardwareId: hardware('REPLACEMENT'),
      monitoringPointId: point.id,
    });

    expect(replacement.lifecycleStatus).toBe(DeviceLifecycleStatus.ENABLED);
  });

  it('stores only a one-way device credential hash', async () => {
    const rawCredential = `integration-device-credential-${randomUUID()}`;
    const credentialHash = await argon2.hash(rawCredential, { type: argon2.argon2id });
    const device = await createDevice({
      credentialHash,
      hardwareId: hardware('HASH'),
      lifecycleStatus: DeviceLifecycleStatus.DISABLED,
    });
    const stored = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });

    expect(await argon2.verify(stored.credentialHash, rawCredential)).toBe(true);
    expect(stored.credentialHash).not.toBe(rawCredential);
    expect(JSON.stringify(stored)).not.toContain(rawCredential);
    expect(stored).not.toHaveProperty('credential');
    expect(stored).not.toHaveProperty('secret');
  });

  it('rejects duplicate device message id', async () => {
    const point = await createMonitoringPoint('message-id');
    const device = await createDevice({
      hardwareId: hardware('MESSAGE'),
      monitoringPointId: point.id,
    });
    const messageId = `message-${randomUUID()}`;
    await createTelemetry(device.id, point.id, { messageId, sequence: 1n });

    await expect(
      createTelemetry(device.id, point.id, {
        bootId: 'different-boot',
        messageId,
        sequence: 2n,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes sequence uniqueness to device and boot id', async () => {
    const point = await createMonitoringPoint('boot-sequence');
    const device = await createDevice({
      hardwareId: hardware('SEQUENCE'),
      monitoringPointId: point.id,
    });
    await createTelemetry(device.id, point.id, {
      bootId: 'boot-a',
      messageId: `message-${randomUUID()}`,
      sequence: 42n,
    });

    await expect(
      createTelemetry(device.id, point.id, {
        bootId: 'boot-a',
        messageId: `message-${randomUUID()}`,
        sequence: 42n,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      createTelemetry(device.id, point.id, {
        bootId: 'boot-b',
        messageId: `message-${randomUUID()}`,
        sequence: 42n,
      }),
    ).resolves.toMatchObject({ bootId: 'boot-b', sequence: 42n });
  });

  it('stores late telemetry without moving device latest state backward', async () => {
    const point = await createMonitoringPoint('late');
    const latestTimestamp = new Date('2026-07-30T08:00:00.000Z');
    const lateTimestamp = new Date('2026-07-29T08:00:00.000Z');
    const device = await createDevice({
      hardwareId: hardware('LATE'),
      lastTelemetryAt: latestTimestamp,
      monitoringPointId: point.id,
    });

    await createTelemetry(device.id, point.id, {
      deviceTimestamp: latestTimestamp,
      messageId: `message-${randomUUID()}`,
      sequence: 2n,
    });
    await createTelemetry(device.id, point.id, {
      deviceTimestamp: lateTimestamp,
      messageId: `message-${randomUUID()}`,
      sequence: 1n,
    });

    const history = await prisma.telemetry.findMany({
      orderBy: { deviceTimestamp: 'desc' },
      where: { deviceId: device.id },
    });
    const unchangedDevice = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });

    expect(history.map((entry) => entry.deviceTimestamp)).toEqual([latestTimestamp, lateTimestamp]);
    expect(unchangedDevice.lastTelemetryAt).toEqual(latestTimestamp);
  });

  it('rejects raw payload containing a top-level credential', async () => {
    const point = await createMonitoringPoint('raw-payload');
    const device = await createDevice({
      hardwareId: hardware('RAW'),
      monitoringPointId: point.id,
    });

    await expect(
      createTelemetry(device.id, point.id, {
        messageId: `message-${randomUUID()}`,
        rawPayload: { messageId: 'unsafe-message', secret: 'must-not-be-stored' },
        sequence: 1n,
      }),
    ).rejects.toMatchObject({ code: 'P2039' });
  });

  it('restricts device deletion when append-only telemetry exists', async () => {
    const point = await createMonitoringPoint('retention');
    const device = await createDevice({
      hardwareId: hardware('RETAIN'),
      monitoringPointId: point.id,
    });
    await createTelemetry(device.id, point.id, {
      messageId: `message-${randomUUID()}`,
      sequence: 1n,
    });

    await expect(prisma.device.delete({ where: { id: device.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(prisma.telemetry.count({ where: { deviceId: device.id } })).resolves.toBe(1);
  });

  async function createMonitoringPoint(suffix: string) {
    return prisma.monitoringPoint.create({
      data: {
        name: `Test Point ${suffix}`,
        organizationId,
        siteId,
      },
    });
  }

  async function createDevice(options: {
    credentialHash?: string;
    hardwareId: string;
    lastTelemetryAt?: Date;
    lifecycleStatus?: DeviceLifecycleStatus;
    monitoringPointId?: string;
  }) {
    const lifecycleStatus = options.lifecycleStatus ?? DeviceLifecycleStatus.ENABLED;
    return prisma.device.create({
      data: {
        credentialHash: options.credentialHash ?? '$argon2id$integration-test-hash-only',
        disabledAt: lifecycleStatus === DeviceLifecycleStatus.DISABLED ? new Date() : null,
        displayName: `Test Device ${options.hardwareId}`,
        hardwareId: options.hardwareId,
        ...(options.lastTelemetryAt === undefined
          ? {}
          : { lastTelemetryAt: options.lastTelemetryAt }),
        lifecycleStatus,
        monitoringPointId: options.monitoringPointId ?? monitoringPointId,
        organizationId,
        siteId,
      },
    });
  }

  async function createTelemetry(
    deviceId: string,
    pointId: string,
    options: {
      bootId?: string;
      deviceTimestamp?: Date;
      messageId: string;
      rawPayload?: Prisma.InputJsonObject;
      sequence: bigint;
    },
  ) {
    const rawPayload = options.rawPayload ?? { messageId: options.messageId };
    return prisma.telemetry.create({
      data: {
        batteryVoltage: '12.7000',
        bootId: options.bootId ?? 'boot-default',
        canonicalPayloadHash: createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex'),
        deviceId,
        deviceTimestamp: options.deviceTimestamp ?? new Date('2026-07-30T07:59:00.000Z'),
        firmwareRiskLevel: FirmwareRiskLevel.SAFE,
        firmwareSirenActive: false,
        firmwareVersion: '1.0.0',
        messageId: options.messageId,
        monitoringPointId: pointId,
        networkType: NetworkType.WIFI,
        rainfallMmHour: '12.40000000000000000000',
        rawPayload,
        sequence: options.sequence,
        signalRssi: '-67.00',
        soilMoisturePct: '62.5000',
        tiltMagnitudeDeg: '0.9000',
        tiltXDeg: '0.8000',
        tiltYDeg: '-0.4000',
      },
    });
  }

  function hardware(suffix: string): string {
    return `TEST-${suffix}-${testRunId}`.toUpperCase();
  }
});
