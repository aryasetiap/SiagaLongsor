import { describe, expect, it, vi } from 'vitest';

import {
  createSimulatorState,
  generateTelemetryPayload,
  parseSimulatorConfig,
  runSimulator,
  SimulatorError,
  type SimulatorConfig,
  type SimulatorLogEntry,
} from './device-simulator.js';

const testEnvironment = {
  SIMULATOR_HARDWARE_ID: 'DEVICE-001',
  SIMULATOR_DEVICE_SECRET: 's'.repeat(43),
};

describe('device telemetry simulator', () => {
  it('parses defaults, environment fallback, and non-secret CLI overrides', () => {
    const defaults = parseSimulatorConfig(testEnvironment, []);
    const overridden = parseSimulatorConfig(
      {
        ...testEnvironment,
        SIMULATOR_SCENARIO: 'duplicate',
        SIMULATOR_COUNT: '20',
        SIMULATOR_INTERVAL_MS: '2000',
        SIMULATOR_SEQUENCE_START: '5',
      },
      ['--', '--scenario', 'late', '--count=3', '--interval', '0', '--sequence-start', '9'],
    );

    expect(defaults).toMatchObject({
      apiBaseUrl: 'http://localhost:3000/api/v1',
      scenario: 'normal',
      count: 10,
      intervalMs: 5000,
      sequenceStart: 1,
    });
    expect(overridden).toMatchObject({
      scenario: 'late',
      count: 3,
      intervalMs: 0,
      sequenceStart: 9,
    });
  });

  it('parses explicit nullable readings while preserving zero', () => {
    const parsed = parseSimulatorConfig(
      {
        ...testEnvironment,
        SIMULATOR_TILT_MAGNITUDE_DEG: '0',
        SIMULATOR_SOIL_MOISTURE_PCT: 'null',
        SIMULATOR_RAINFALL_MM_HOUR: '4.5',
        SIMULATOR_BATTERY_VOLTAGE: 'null',
      },
      [],
    );
    expect(parsed.readings).toEqual({
      tiltMagnitudeDeg: 0,
      soilMoisturePct: null,
      rainfallMmHour: 4.5,
      batteryVoltage: null,
    });
    expect(() =>
      parseSimulatorConfig({ ...testEnvironment, SIMULATOR_TILT_MAGNITUDE_DEG: 'NaN' }, []),
    ).toThrow(SimulatorError);
  });

  it('requires active-profile values for the presentation scenario', () => {
    expect(() =>
      parseSimulatorConfig({ ...testEnvironment, SIMULATOR_SCENARIO: 'presentation' }, []),
    ).toThrowError(expect.objectContaining({ code: 'CONFIG_REQUIRED' }));
    const config = parseSimulatorConfig(presentationEnvironment(), []);
    expect(config).toMatchObject({
      scenario: 'presentation',
      count: 0,
      presentationProfile: { tiltMagnitudeDeg: { watch: 3, danger: 8 } },
    });
  });

  it('requires credentials from environment and never accepts a secret CLI option', () => {
    expect(() => parseSimulatorConfig({}, [])).toThrowError(
      expect.objectContaining({ code: 'CONFIG_REQUIRED' }),
    );
    expect(() =>
      parseSimulatorConfig({ SIMULATOR_HARDWARE_ID: 'DEVICE-001' }, ['--secret', 'not-allowed']),
    ).toThrowError(expect.objectContaining({ code: 'CONFIG_INVALID' }));
  });

  it('validates URLs, scenarios, credentials, and numeric configuration', () => {
    const invalidEnvironments = [
      { ...testEnvironment, SIMULATOR_API_BASE_URL: 'file:///tmp/telemetry' },
      { ...testEnvironment, SIMULATOR_SCENARIO: 'danger' },
      { ...testEnvironment, SIMULATOR_DEVICE_SECRET: 'short' },
      { ...testEnvironment, SIMULATOR_COUNT: '0' },
      { ...testEnvironment, SIMULATOR_INTERVAL_MS: '-1' },
      { ...testEnvironment, SIMULATOR_SEQUENCE_START: '1.5' },
    ];

    for (const environment of invalidEnvironments) {
      expect(() => parseSimulatorConfig(environment, [])).toThrow(SimulatorError);
    }
  });

  it('generates canonical valid payloads with stable bootId and incrementing sequence', () => {
    const state = createSimulatorState(7, () => 'process-id');
    const first = generateTelemetryPayload(
      state,
      new Date('2026-07-30T00:00:00.000Z'),
      () => 'message-a',
    );
    const second = generateTelemetryPayload(
      state,
      new Date('2026-07-30T00:00:01.000Z'),
      () => 'message-b',
    );

    expect(first).toMatchObject({
      messageId: 'msg_message-a',
      bootId: 'boot_process-id',
      sequence: 7,
      firmwareVersion: 'simulator-1.0.0',
      deviceAssessment: { riskLevel: 'SAFE', sirenActive: false },
    });
    expect(second.bootId).toBe(first.bootId);
    expect(second.sequence).toBe(8);
    expect(first).not.toHaveProperty('deviceId');
    expect(first).not.toHaveProperty('hardwareId');
    expect(first).not.toHaveProperty('serverRisk');
    expect(first).not.toHaveProperty('Authorization');
  });

  it('preserves configured null readings in generated payloads', () => {
    const payload = generateTelemetryPayload(
      createSimulatorState(1, () => 'boot'),
      new Date(),
      () => 'message',
      { tiltMagnitudeDeg: null, soilMoisturePct: 0, rainfallMmHour: null, batteryVoltage: null },
    );
    expect(payload.readings).toMatchObject({
      tiltMagnitudeDeg: null,
      soilMoisturePct: 0,
      rainfallMmHour: null,
      batteryVoltage: null,
    });
  });

  it('normal scenario sends unique messages with incrementing sequence', async () => {
    const capture = createFetchCapture([
      successResponse(201, false, 'tel-1'),
      successResponse(201, false, 'tel-2'),
      successResponse(201, false, 'tel-3'),
    ]);
    await runSimulator(
      config({ count: 3 }),
      dependencies(capture.fetch, ['boot', 'one', 'two', 'three']),
    );

    const payloads = capture.payloads();
    expect(payloads.map((payload) => payload.sequence)).toEqual([1, 2, 3]);
    expect(new Set(payloads.map((payload) => payload.messageId)).size).toBe(3);
  });

  it('presentation stream structurally exercises each visible risk state and recovery', async () => {
    const profile = presentationProfile();
    const responses = Array.from({ length: 17 }, (_, index) =>
      successResponse(201, false, `tel-${index}`),
    );
    const capture = createFetchCapture(responses);
    await runSimulator(
      config({
        scenario: 'presentation',
        count: 1,
        intervalMs: 1000,
        presentationProfile: profile,
      }),
      dependencies(
        capture.fetch,
        Array.from({ length: 20 }, (_, index) => `id-${index}`),
      ),
    );
    const payloads = capture.payloads();
    expect(payloads).toHaveLength(17);
    expect(new Set(payloads.map((payload) => payload.messageId)).size).toBe(17);
    expect(
      payloads.every((payload) => payload.firmwareVersion === 'presentation-simulator-1.0.0'),
    ).toBe(true);
    expect(payloads.map((payload) => payload.deviceAssessment.riskLevel)).toEqual([
      'SAFE',
      'SAFE',
      'SAFE',
      'WATCH',
      'WATCH',
      'WATCH',
      'DANGER',
      'DANGER',
      'DANGER',
      'DANGER',
      'DANGER',
      'DANGER',
      'UNKNOWN',
      'UNKNOWN',
      'SAFE',
      'SAFE',
      'SAFE',
    ]);

    const safeSamples = [...payloads.slice(0, 3), ...payloads.slice(14, 17)];
    expect(safeSamples).toHaveLength(6);
    expect(
      safeSamples.every(
        (payload) =>
          payload.readings.tiltMagnitudeDeg! < profile.tiltMagnitudeDeg.watch &&
          payload.readings.soilMoisturePct! < profile.soilMoisturePct.watch &&
          payload.readings.rainfallMmHour! < profile.rainfallMmHour.watch,
      ),
    ).toBe(true);

    const watchSamples = payloads.slice(3, 6);
    expect(
      watchSamples.every(
        (payload) =>
          payload.readings.tiltMagnitudeDeg! >= profile.tiltMagnitudeDeg.watch &&
          payload.readings.tiltMagnitudeDeg! < profile.tiltMagnitudeDeg.danger &&
          payload.readings.soilMoisturePct! >= profile.soilMoisturePct.watch &&
          payload.readings.soilMoisturePct! < profile.soilMoisturePct.danger &&
          payload.readings.rainfallMmHour! >= profile.rainfallMmHour.watch &&
          payload.readings.rainfallMmHour! < profile.rainfallMmHour.danger,
      ),
    ).toBe(true);

    const warningSamples = payloads.slice(6, 9);
    expect(
      warningSamples.every(
        (payload) =>
          payload.readings.tiltMagnitudeDeg! >= profile.tiltMagnitudeDeg.danger &&
          payload.readings.rainfallMmHour! < profile.rainfallMmHour.danger &&
          payload.readings.soilMoisturePct! < profile.soilMoisturePct.danger,
      ),
    ).toBe(true);

    const dangerSamples = payloads.slice(9, 12);
    expect(
      dangerSamples.every(
        (payload) =>
          payload.readings.tiltMagnitudeDeg! >= profile.tiltMagnitudeDeg.danger &&
          payload.readings.rainfallMmHour! >= profile.rainfallMmHour.danger,
      ),
    ).toBe(true);
    expect(
      payloads.slice(12, 14).every((payload) => payload.readings.tiltMagnitudeDeg === null),
    ).toBe(true);
  });

  it('duplicate scenario sends the identical payload and validates 201 then 200', async () => {
    const capture = createFetchCapture([
      successResponse(201, false, 'tel-duplicate'),
      successResponse(200, true, 'tel-duplicate'),
    ]);
    await runSimulator(config({ scenario: 'duplicate' }), dependencies(capture.fetch));

    expect(capture.payloads()).toHaveLength(2);
    expect(capture.payloads()[1]).toEqual(capture.payloads()[0]);
  });

  it('sequence conflict keeps boot and sequence but changes messageId', async () => {
    const capture = createFetchCapture([
      successResponse(201, false, 'tel-sequence'),
      errorResponse(409, 'SEQUENCE_CONFLICT'),
    ]);
    await runSimulator(config({ scenario: 'sequence-conflict' }), dependencies(capture.fetch));
    const [first, second] = capture.payloads();

    expect(second?.bootId).toBe(first?.bootId);
    expect(second?.sequence).toBe(first?.sequence);
    expect(second?.messageId).not.toBe(first?.messageId);
  });

  it('idempotency conflict keeps messageId but changes the payload', async () => {
    const capture = createFetchCapture([
      successResponse(201, false, 'tel-idempotency'),
      errorResponse(409, 'IDEMPOTENCY_CONFLICT'),
    ]);
    await runSimulator(config({ scenario: 'idempotency-conflict' }), dependencies(capture.fetch));
    const [first, second] = capture.payloads();

    expect(second?.messageId).toBe(first?.messageId);
    expect(second?.readings).not.toEqual(first?.readings);
  });

  it('late scenario sends current data followed by older append-only data', async () => {
    const capture = createFetchCapture([
      successResponse(201, false, 'tel-current'),
      successResponse(201, false, 'tel-late'),
    ]);
    await runSimulator(config({ scenario: 'late' }), dependencies(capture.fetch));
    const [current, late] = capture.payloads();

    expect(new Date(late?.timestamp ?? 0).getTime()).toBeLessThan(
      new Date(current?.timestamp ?? 0).getTime(),
    );
    expect(late?.sequence).toBe((current?.sequence ?? 0) + 1);
  });

  it('sends the contract headers but never includes credentials in body or logs', async () => {
    const logs: SimulatorLogEntry[] = [];
    const capture = createFetchCapture([successResponse(201, false, 'tel-safe')]);
    await runSimulator(config(), {
      ...dependencies(capture.fetch),
      log: (entry) => logs.push(entry),
    });

    const request = capture.requests[0];
    const headers = request?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Device DEVICE-001.${testEnvironment.SIMULATOR_DEVICE_SECRET}`,
    );
    expect(headers['Idempotency-Key']).toBe(capture.payloads()[0]?.messageId);
    expect(request?.body).not.toContain(testEnvironment.SIMULATOR_DEVICE_SECRET);
    expect(JSON.stringify(logs)).not.toContain(testEnvironment.SIMULATOR_DEVICE_SECRET);
    expect(JSON.stringify(logs)).not.toContain('Authorization');
  });

  it('redacts credentials from server error messages before logging', async () => {
    const logs: SimulatorLogEntry[] = [];
    const credential = `Device DEVICE-001.${testEnvironment.SIMULATOR_DEVICE_SECRET}`;
    const capture = createFetchCapture([
      successResponse(201, false, 'tel-safe-first'),
      new Response(
        JSON.stringify({
          error: {
            code: 'SEQUENCE_CONFLICT',
            message: `unsafe ${credential}`,
          },
        }),
        { status: 409 },
      ),
    ]);

    await runSimulator(config({ scenario: 'sequence-conflict' }), {
      ...dependencies(capture.fetch),
      log: (entry) => logs.push(entry),
    });
    expect(JSON.stringify(logs)).not.toContain(testEnvironment.SIMULATOR_DEVICE_SECRET);
    expect(logs[1]?.errorMessage).toContain('[REDACTED]');
  });

  it('reports a safe API error code when a normal send is rejected', async () => {
    const logs: SimulatorLogEntry[] = [];
    const capture = createFetchCapture([errorResponse(401, 'DEVICE_CREDENTIAL_INVALID')]);

    await expect(
      runSimulator(config(), {
        ...dependencies(capture.fetch),
        log: (entry) => logs.push(entry),
      }),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    expect(logs).toMatchObject([
      {
        httpStatus: 401,
        errorCode: 'DEVICE_CREDENTIAL_INVALID',
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain(testEnvironment.SIMULATOR_DEVICE_SECRET);
    expect(JSON.stringify(logs)).not.toContain('Authorization');
  });

  it('fails on network, invalid JSON, and unexpected status responses', async () => {
    const failures = [
      vi.fn<typeof fetch>().mockRejectedValue(new Error('network failed')),
      vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json', { status: 201 })),
      vi.fn<typeof fetch>().mockResolvedValue(successResponse(200, true, 'unexpected')),
    ];

    for (const fetchMock of failures) {
      await expect(runSimulator(config(), dependencies(fetchMock))).rejects.toBeInstanceOf(
        SimulatorError,
      );
    }
  });

  it('cancels gracefully without sending after an abort signal', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort(new DOMException('Stopped', 'AbortError'));

    await expect(
      runSimulator(config(), dependencies(fetchMock), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function config(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    apiBaseUrl: 'http://localhost:3001/api/v1',
    hardwareId: testEnvironment.SIMULATOR_HARDWARE_ID,
    deviceSecret: testEnvironment.SIMULATOR_DEVICE_SECRET,
    scenario: 'normal',
    count: 1,
    intervalMs: 0,
    sequenceStart: 1,
    readings: {
      tiltMagnitudeDeg: 0.9,
      soilMoisturePct: 62.5,
      rainfallMmHour: 12.4,
      batteryVoltage: 12.7,
    },
    presentationProfile: null,
    ...overrides,
  };
}

function dependencies(
  fetchMock: typeof fetch,
  identifiers = ['boot-id', 'message-id', 'message-id-2'],
) {
  let identifierIndex = 0;
  return {
    fetch: fetchMock,
    wait: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-07-30T00:00:00.000Z'),
    randomId: () => identifiers[identifierIndex++] ?? `id-${identifierIndex}`,
    log: vi.fn(),
  };
}

function createFetchCapture(responses: Response[]) {
  const requests: RequestInit[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    requests.push(init ?? {});
    const response = responses.shift();
    if (response === undefined) throw new Error('Missing mocked response');
    return Promise.resolve(response);
  });

  return {
    fetch: fetchMock,
    requests,
    payloads: () =>
      requests.map((request_) => JSON.parse(String(request_.body)) as TelemetryPayloadForTest),
  };
}

interface TelemetryPayloadForTest {
  readonly messageId: string;
  readonly bootId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly firmwareVersion: string;
  readonly deviceAssessment: {
    readonly riskLevel: 'SAFE' | 'WATCH' | 'DANGER' | 'UNKNOWN';
    readonly sirenActive: boolean;
  };
  readonly readings: Record<string, number | null>;
}

function presentationEnvironment() {
  return {
    ...testEnvironment,
    SIMULATOR_SCENARIO: 'presentation',
    SIMULATOR_PRESENTATION_TILT_MAGNITUDE_DEG_WATCH: '3',
    SIMULATOR_PRESENTATION_TILT_MAGNITUDE_DEG_DANGER: '8',
    SIMULATOR_PRESENTATION_SOIL_MOISTURE_PCT_WATCH: '65',
    SIMULATOR_PRESENTATION_SOIL_MOISTURE_PCT_DANGER: '85',
    SIMULATOR_PRESENTATION_RAINFALL_MM_HOUR_WATCH: '20',
    SIMULATOR_PRESENTATION_RAINFALL_MM_HOUR_DANGER: '50',
  };
}

function presentationProfile() {
  return {
    tiltMagnitudeDeg: { watch: 3, danger: 8 },
    soilMoisturePct: { watch: 65, danger: 85 },
    rainfallMmHour: { watch: 20, danger: 50 },
  };
}

function successResponse(status: number, duplicate: boolean, telemetryId: string): Response {
  return new Response(
    JSON.stringify({
      accepted: true,
      duplicate,
      telemetryId,
      receivedAt: '2026-07-30T00:00:00.100Z',
    }),
    { status },
  );
}

function errorResponse(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message: 'Scenario conflict yang diharapkan.',
      },
    }),
    { status },
  );
}
