import { randomUUID } from 'node:crypto';

import type { FirmwareRisk } from '../risk/risk-engine.types.js';

export const SIMULATOR_SCENARIOS = [
  'normal',
  'duplicate',
  'sequence-conflict',
  'idempotency-conflict',
  'late',
  'missing-tilt',
  'presentation',
] as const;

export type SimulatorScenario = (typeof SIMULATOR_SCENARIOS)[number];

export interface SimulatorConfig {
  readonly apiBaseUrl: string;
  readonly hardwareId: string;
  readonly deviceSecret: string;
  readonly scenario: SimulatorScenario;
  readonly count: number;
  readonly intervalMs: number;
  readonly sequenceStart: number;
  readonly readings: SimulatorReadings;
  readonly presentationProfile?: PresentationProfile | null;
}

export interface PresentationProfile {
  readonly tiltMagnitudeDeg: { readonly watch: number; readonly danger: number };
  readonly soilMoisturePct: { readonly watch: number; readonly danger: number };
  readonly rainfallMmHour: { readonly watch: number; readonly danger: number };
}

export interface SimulatorReadings {
  readonly tiltMagnitudeDeg: number | null;
  readonly soilMoisturePct: number | null;
  readonly rainfallMmHour: number | null;
  readonly batteryVoltage: number | null;
}

export interface TelemetryPayload {
  readonly messageId: string;
  readonly bootId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly firmwareVersion: string;
  readonly network: {
    readonly type: 'WIFI';
    readonly signalRssi: number;
  };
  readonly readings: {
    readonly tiltXDeg: number;
    readonly tiltYDeg: number;
    readonly tiltMagnitudeDeg: number | null;
    readonly soilMoisturePct: number | null;
    readonly rainfallMmHour: number | null;
    readonly batteryVoltage: number | null;
  };
  readonly deviceAssessment: {
    readonly riskLevel: FirmwareRisk;
    readonly sirenActive: false;
  };
}

export interface SimulatorState {
  readonly bootId: string;
  nextSequence: number;
}

export interface SimulatorLogEntry {
  readonly scenario: SimulatorScenario;
  readonly sequence: number;
  readonly messageId: string;
  readonly timestamp: string;
  readonly httpStatus: number;
  readonly accepted?: boolean;
  readonly duplicate?: boolean;
  readonly telemetryId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface SimulatorDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly log: (entry: SimulatorLogEntry) => void;
  readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly now: () => Date;
  readonly randomId: () => string;
}

interface ExpectedResponse {
  readonly status: number;
  readonly duplicate?: boolean;
  readonly errorCode?: string;
}

interface ParsedSuccessResponse {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly telemetryId: string;
  readonly receivedAt: string;
}

interface ParsedErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export class SimulatorError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SimulatorError';
  }
}

export function parseSimulatorConfig(
  environment: NodeJS.ProcessEnv,
  arguments_: readonly string[],
): SimulatorConfig {
  const options = parseOptions(arguments_);
  const scenario = parseScenario(options.scenario ?? environment.SIMULATOR_SCENARIO ?? 'normal');
  const hardwareId = required(environment.SIMULATOR_HARDWARE_ID, 'SIMULATOR_HARDWARE_ID');
  const deviceSecret = required(environment.SIMULATOR_DEVICE_SECRET, 'SIMULATOR_DEVICE_SECRET');

  if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(hardwareId)) {
    throw new SimulatorError(
      'CONFIG_INVALID',
      'SIMULATOR_HARDWARE_ID harus mengikuti format hardwareId API.',
    );
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(deviceSecret)) {
    throw new SimulatorError(
      'CONFIG_INVALID',
      'SIMULATOR_DEVICE_SECRET tidak memiliki format credential yang valid.',
    );
  }

  return {
    apiBaseUrl: parseBaseUrl(environment.SIMULATOR_API_BASE_URL ?? 'http://localhost:3000/api/v1'),
    hardwareId,
    deviceSecret,
    scenario,
    count: parseInteger(
      options.count ?? environment.SIMULATOR_COUNT ?? (scenario === 'presentation' ? '0' : '10'),
      'count',
      scenario === 'presentation' ? 0 : 1,
    ),
    intervalMs: parseInteger(
      options.interval ?? environment.SIMULATOR_INTERVAL_MS ?? '5000',
      'interval',
      0,
    ),
    sequenceStart: parseInteger(
      options.sequenceStart ?? environment.SIMULATOR_SEQUENCE_START ?? '1',
      'sequence-start',
      0,
    ),
    readings: {
      tiltMagnitudeDeg: parseReading(
        environment.SIMULATOR_TILT_MAGNITUDE_DEG,
        'SIMULATOR_TILT_MAGNITUDE_DEG',
        0,
        180,
        0.9,
      ),
      soilMoisturePct: parseReading(
        environment.SIMULATOR_SOIL_MOISTURE_PCT,
        'SIMULATOR_SOIL_MOISTURE_PCT',
        0,
        100,
        62.5,
      ),
      rainfallMmHour: parseReading(
        environment.SIMULATOR_RAINFALL_MM_HOUR,
        'SIMULATOR_RAINFALL_MM_HOUR',
        0,
        undefined,
        12.4,
      ),
      batteryVoltage: parseReading(
        environment.SIMULATOR_BATTERY_VOLTAGE,
        'SIMULATOR_BATTERY_VOLTAGE',
        0,
        30,
        12.7,
      ),
    },
    presentationProfile: scenario === 'presentation' ? parsePresentationProfile(environment) : null,
  };
}

export function createSimulatorState(
  sequenceStart: number,
  randomId: () => string = randomUUID,
): SimulatorState {
  return {
    bootId: `boot_${randomId()}`,
    nextSequence: sequenceStart,
  };
}

export function generateTelemetryPayload(
  state: SimulatorState,
  now = new Date(),
  randomId: () => string = randomUUID,
  readings: SimulatorReadings = {
    tiltMagnitudeDeg: 0.9,
    soilMoisturePct: 62.5,
    rainfallMmHour: 12.4,
    batteryVoltage: 12.7,
  },
): TelemetryPayload {
  if (!Number.isSafeInteger(state.nextSequence) || state.nextSequence < 0) {
    throw new SimulatorError('SEQUENCE_INVALID', 'Sequence simulator berada di luar batas aman.');
  }

  const payload: TelemetryPayload = {
    messageId: `msg_${randomId()}`,
    bootId: state.bootId,
    sequence: state.nextSequence,
    timestamp: now.toISOString(),
    firmwareVersion: 'simulator-1.0.0',
    network: {
      type: 'WIFI',
      signalRssi: -67,
    },
    readings: {
      tiltXDeg: 0.8,
      tiltYDeg: -0.4,
      ...readings,
    },
    deviceAssessment: {
      riskLevel: 'SAFE',
      sirenActive: false,
    },
  };
  state.nextSequence += 1;
  return payload;
}

export async function runSimulator(
  config: SimulatorConfig,
  dependencies: Partial<SimulatorDependencies> = {},
  signal = new AbortController().signal,
): Promise<void> {
  const runtime: SimulatorDependencies = {
    fetch: dependencies.fetch ?? globalThis.fetch,
    log: dependencies.log ?? ((entry) => console.log(JSON.stringify(entry))),
    wait: dependencies.wait ?? wait,
    now: dependencies.now ?? (() => new Date()),
    randomId: dependencies.randomId ?? randomUUID,
  };
  const state = createSimulatorState(config.sequenceStart, runtime.randomId);

  switch (config.scenario) {
    case 'normal':
      await runNormal(config, state, runtime, signal);
      return;
    case 'duplicate':
      await runDuplicate(config, state, runtime, signal);
      return;
    case 'sequence-conflict':
      await runSequenceConflict(config, state, runtime, signal);
      return;
    case 'idempotency-conflict':
      await runIdempotencyConflict(config, state, runtime, signal);
      return;
    case 'late':
      await runLate(config, state, runtime, signal);
      return;
    case 'missing-tilt':
      await runNormal(
        { ...config, readings: { ...config.readings, tiltMagnitudeDeg: null } },
        state,
        runtime,
        signal,
      );
      return;
    case 'presentation':
      await runPresentation(config, state, runtime, signal);
      return;
  }
}

export async function runDeviceSimulatorCli(): Promise<number> {
  if (process.argv.slice(2).includes('--help')) {
    console.log(helpText());
    return 0;
  }

  let config: SimulatorConfig;
  try {
    config = parseSimulatorConfig(process.env, process.argv.slice(2));
  } catch (error) {
    console.error(formatCliError(error));
    return 1;
  }

  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    console.log(
      JSON.stringify({
        event: 'simulator_started',
        scenario: config.scenario,
        count: config.count,
        intervalMs: config.intervalMs,
      }),
    );
    await runSimulator(config, {}, controller.signal);
    console.log(JSON.stringify({ event: 'simulator_completed', scenario: config.scenario }));
    return 0;
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      console.log(JSON.stringify({ event: 'simulator_stopped', scenario: config.scenario }));
      return 0;
    }
    console.error(formatCliError(error));
    return 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

async function runNormal(
  config: SimulatorConfig,
  state: SimulatorState,
  runtime: SimulatorDependencies,
  signal: AbortSignal,
): Promise<void> {
  for (let index = 0; index < config.count; index += 1) {
    assertNotCancelled(signal);
    const payload = generateTelemetryPayload(
      state,
      runtime.now(),
      runtime.randomId,
      config.readings,
    );
    await sendAndValidate(config, runtime, payload, { status: 201, duplicate: false }, signal);
    if (index < config.count - 1) await runtime.wait(config.intervalMs, signal);
  }
}

async function runPresentation(
  config: SimulatorConfig,
  state: SimulatorState,
  runtime: SimulatorDependencies,
  signal: AbortSignal,
): Promise<void> {
  if (config.presentationProfile == null) {
    throw new SimulatorError('CONFIG_INVALID', 'Profil aktif presentasi wajib dikonfigurasi.');
  }
  if (config.intervalMs < 1_000) {
    throw new SimulatorError('CONFIG_INVALID', 'interval presentasi minimal 1000 ms.');
  }
  let cycle = 0;
  while (config.count === 0 || cycle < config.count) {
    for (const sample of presentationReadings(config.presentationProfile)) {
      assertNotCancelled(signal);
      const payload = {
        ...generateTelemetryPayload(state, runtime.now(), runtime.randomId, sample.readings),
        firmwareVersion: 'presentation-simulator-1.0.0',
        deviceAssessment: {
          riskLevel: sample.firmwareRisk,
          sirenActive: false as const,
        },
      };
      await sendAndValidate(config, runtime, payload, { status: 201, duplicate: false }, signal);
      await runtime.wait(config.intervalMs, signal);
    }
    cycle += 1;
  }
}

function presentationReadings(profile: PresentationProfile): readonly PresentationSample[] {
  const safe = readingsAt(profile, 0.5);
  const watch = readingsAt(profile, 1.1);
  const warning = { ...safe, tiltMagnitudeDeg: profile.tiltMagnitudeDeg.danger };
  const danger = readingsAt(profile, 1.2, true);
  const unavailable = { ...danger, tiltMagnitudeDeg: null };
  return [
    ...repeatPresentationSample(safe, 'SAFE'),
    ...repeatPresentationSample(watch, 'WATCH'),
    ...repeatPresentationSample(warning, 'DANGER'),
    ...repeatPresentationSample(danger, 'DANGER'),
    ...repeatPresentationSample(unavailable, 'UNKNOWN', 2),
    ...repeatPresentationSample(safe, 'SAFE'),
  ];
}

interface PresentationSample {
  readonly readings: SimulatorReadings;
  readonly firmwareRisk: FirmwareRisk;
}

function repeatPresentationSample(
  readings: SimulatorReadings,
  firmwareRisk: FirmwareRisk,
  count = 3,
): readonly PresentationSample[] {
  return Array.from({ length: count }, () => ({ readings, firmwareRisk }));
}

function readingsAt(
  profile: PresentationProfile,
  factor: number,
  aboveDanger = false,
): SimulatorReadings {
  const value = (threshold: { readonly watch: number; readonly danger: number }) =>
    aboveDanger
      ? threshold.danger + Math.max((threshold.danger - threshold.watch) * 0.1, 0.01)
      : threshold.watch + (threshold.danger - threshold.watch) * (factor - 1);
  return {
    tiltMagnitudeDeg: value(profile.tiltMagnitudeDeg),
    soilMoisturePct: value(profile.soilMoisturePct),
    rainfallMmHour: value(profile.rainfallMmHour),
    batteryVoltage: 12.7,
  };
}

async function runDuplicate(
  config: SimulatorConfig,
  state: SimulatorState,
  runtime: SimulatorDependencies,
  signal: AbortSignal,
): Promise<void> {
  const payload = generateTelemetryPayload(state, runtime.now(), runtime.randomId, config.readings);
  await sendAndValidate(config, runtime, payload, { status: 201, duplicate: false }, signal);
  await runtime.wait(config.intervalMs, signal);
  await sendAndValidate(config, runtime, payload, { status: 200, duplicate: true }, signal);
}

async function runSequenceConflict(
  config: SimulatorConfig,
  state: SimulatorState,
  runtime: SimulatorDependencies,
  signal: AbortSignal,
): Promise<void> {
  const first = generateTelemetryPayload(state, runtime.now(), runtime.randomId, config.readings);
  const second: TelemetryPayload = {
    ...first,
    messageId: `msg_${runtime.randomId()}`,
  };
  await sendAndValidate(config, runtime, first, { status: 201, duplicate: false }, signal);
  await runtime.wait(config.intervalMs, signal);
  await sendAndValidate(
    config,
    runtime,
    second,
    { status: 409, errorCode: 'SEQUENCE_CONFLICT' },
    signal,
  );
}

async function runIdempotencyConflict(
  config: SimulatorConfig,
  state: SimulatorState,
  runtime: SimulatorDependencies,
  signal: AbortSignal,
): Promise<void> {
  const first = generateTelemetryPayload(state, runtime.now(), runtime.randomId, config.readings);
  const second: TelemetryPayload = {
    ...first,
    readings: {
      ...first.readings,
      soilMoisturePct: 63.5,
    },
  };
  await sendAndValidate(config, runtime, first, { status: 201, duplicate: false }, signal);
  await runtime.wait(config.intervalMs, signal);
  await sendAndValidate(
    config,
    runtime,
    second,
    { status: 409, errorCode: 'IDEMPOTENCY_CONFLICT' },
    signal,
  );
}

async function runLate(
  config: SimulatorConfig,
  state: SimulatorState,
  runtime: SimulatorDependencies,
  signal: AbortSignal,
): Promise<void> {
  const currentTime = runtime.now();
  const current = generateTelemetryPayload(state, currentTime, runtime.randomId, config.readings);
  const late = generateTelemetryPayload(
    state,
    new Date(currentTime.getTime() - 60 * 60 * 1_000),
    runtime.randomId,
    config.readings,
  );
  await sendAndValidate(config, runtime, current, { status: 201, duplicate: false }, signal);
  await runtime.wait(config.intervalMs, signal);
  await sendAndValidate(config, runtime, late, { status: 201, duplicate: false }, signal);
}

async function sendAndValidate(
  config: SimulatorConfig,
  runtime: SimulatorDependencies,
  payload: TelemetryPayload,
  expected: ExpectedResponse,
  signal: AbortSignal,
): Promise<void> {
  assertNotCancelled(signal);

  let response: Response;
  try {
    response = await runtime.fetch(`${config.apiBaseUrl}/iot/telemetry`, {
      method: 'POST',
      headers: {
        Authorization: `Device ${config.hardwareId}.${config.deviceSecret}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.messageId,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (signal.aborted || isAbortError(error)) throw error;
    throw new SimulatorError('NETWORK_ERROR', 'Request telemetry gagal mencapai API.');
  }

  const body = await parseResponse(response);
  const baseLog = {
    scenario: config.scenario,
    sequence: payload.sequence,
    messageId: payload.messageId,
    timestamp: payload.timestamp,
    httpStatus: response.status,
  } as const;

  if (expected.errorCode !== undefined) {
    const parsed = parseErrorResponse(body);
    runtime.log({
      ...baseLog,
      errorCode: sanitize(parsed.error.code, config),
      errorMessage: sanitize(parsed.error.message, config),
    });
    if (response.status !== expected.status || parsed.error.code !== expected.errorCode) {
      throw new SimulatorError(
        'UNEXPECTED_RESPONSE',
        `Response tidak sesuai scenario: diharapkan ${expected.status} ${expected.errorCode}.`,
      );
    }
    return;
  }

  if (!response.ok) {
    const parsed = parseErrorResponse(body);
    runtime.log({
      ...baseLog,
      errorCode: sanitize(parsed.error.code, config),
      errorMessage: sanitize(parsed.error.message, config),
    });
    throw new SimulatorError(
      'UNEXPECTED_RESPONSE',
      `Response tidak sesuai scenario: diharapkan HTTP ${expected.status}.`,
    );
  }

  const parsed = parseSuccessResponse(body);
  runtime.log({
    ...baseLog,
    accepted: parsed.accepted,
    duplicate: parsed.duplicate,
    telemetryId: sanitize(parsed.telemetryId, config),
  });
  if (
    response.status !== expected.status ||
    parsed.accepted !== true ||
    parsed.duplicate !== expected.duplicate
  ) {
    throw new SimulatorError(
      'UNEXPECTED_RESPONSE',
      `Response tidak sesuai scenario: diharapkan HTTP ${expected.status}.`,
    );
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new SimulatorError('RESPONSE_INVALID', 'Response API tidak dapat dibaca.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SimulatorError('RESPONSE_INVALID', 'Response API bukan JSON yang valid.');
  }
}

function parseSuccessResponse(value: unknown): ParsedSuccessResponse {
  if (
    !isRecord(value) ||
    value.accepted !== true ||
    typeof value.duplicate !== 'boolean' ||
    typeof value.telemetryId !== 'string' ||
    typeof value.receivedAt !== 'string'
  ) {
    throw new SimulatorError('RESPONSE_INVALID', 'Response sukses API tidak sesuai kontrak.');
  }
  return value as unknown as ParsedSuccessResponse;
}

function parseErrorResponse(value: unknown): ParsedErrorResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.error) ||
    typeof value.error.code !== 'string' ||
    typeof value.error.message !== 'string'
  ) {
    throw new SimulatorError('RESPONSE_INVALID', 'Response error API tidak sesuai kontrak.');
  }
  return value as unknown as ParsedErrorResponse;
}

function parseOptions(arguments_: readonly string[]): Record<string, string> {
  const allowed = new Set(['scenario', 'count', 'interval', 'sequence-start']);
  const result: Record<string, string> = {};

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--') continue;
    if (argument === undefined || !argument.startsWith('--')) {
      throw new SimulatorError('CONFIG_INVALID', 'CLI option harus memakai format --nama nilai.');
    }
    const [rawName, inlineValue] = argument.slice(2).split('=', 2);
    if (rawName === undefined || !allowed.has(rawName)) {
      throw new SimulatorError('CONFIG_INVALID', `CLI option tidak dikenal: --${rawName ?? ''}.`);
    }
    const value = inlineValue ?? arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new SimulatorError('CONFIG_INVALID', `Nilai untuk --${rawName} diperlukan.`);
    }
    if (inlineValue === undefined) index += 1;
    result[camelCaseOption(rawName)] = value;
  }
  return result;
}

function parseScenario(value: string): SimulatorScenario {
  if (!(SIMULATOR_SCENARIOS as readonly string[]).includes(value)) {
    throw new SimulatorError('CONFIG_INVALID', `Scenario tidak dikenal: ${value}.`);
  }
  return value as SimulatorScenario;
}

function parseBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SimulatorError('CONFIG_INVALID', 'SIMULATOR_API_BASE_URL harus berupa URL valid.');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new SimulatorError(
      'CONFIG_INVALID',
      'SIMULATOR_API_BASE_URL hanya mendukung HTTP/HTTPS tanpa credential.',
    );
  }
  return parsed.toString().replace(/\/$/, '');
}

function parseInteger(value: string, name: string, minimum: number): number {
  if (!/^\d+$/.test(value)) {
    throw new SimulatorError('CONFIG_INVALID', `${name} harus berupa integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new SimulatorError('CONFIG_INVALID', `${name} berada di luar batas yang valid.`);
  }
  return parsed;
}

function parseReading(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number | undefined,
  fallback: number,
): number | null {
  if (value === undefined || value.length === 0) return fallback;
  if (value === 'null') return null;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))
    throw new SimulatorError(
      'CONFIG_INVALID',
      `${name} harus berupa angka terbatas atau literal null.`,
    );
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum))
    throw new SimulatorError('CONFIG_INVALID', `${name} berada di luar rentang telemetry.`);
  return parsed;
}

function parsePresentationProfile(environment: NodeJS.ProcessEnv): PresentationProfile {
  return {
    tiltMagnitudeDeg: parsePresentationThreshold(environment, 'TILT_MAGNITUDE_DEG'),
    soilMoisturePct: parsePresentationThreshold(environment, 'SOIL_MOISTURE_PCT'),
    rainfallMmHour: parsePresentationThreshold(environment, 'RAINFALL_MM_HOUR'),
  };
}

function parsePresentationThreshold(
  environment: NodeJS.ProcessEnv,
  sensor: string,
): { readonly watch: number; readonly danger: number } {
  const watch = parseReading(
    required(
      environment[`SIMULATOR_PRESENTATION_${sensor}_WATCH`],
      `SIMULATOR_PRESENTATION_${sensor}_WATCH`,
    ),
    `SIMULATOR_PRESENTATION_${sensor}_WATCH`,
    0,
    undefined,
    0,
  );
  const danger = parseReading(
    required(
      environment[`SIMULATOR_PRESENTATION_${sensor}_DANGER`],
      `SIMULATOR_PRESENTATION_${sensor}_DANGER`,
    ),
    `SIMULATOR_PRESENTATION_${sensor}_DANGER`,
    0,
    undefined,
    0,
  );
  if (watch === null || danger === null || watch >= danger) {
    throw new SimulatorError('CONFIG_INVALID', `Threshold presentasi ${sensor} tidak valid.`);
  }
  return { watch, danger };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new SimulatorError('CONFIG_REQUIRED', `${name} wajib diisi melalui environment.`);
  }
  return value;
}

function camelCaseOption(value: string): string {
  return value.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitize(value: string, config: SimulatorConfig): string {
  return stripControlCharacters(
    value
      .replaceAll(config.deviceSecret, '[REDACTED]')
      .replaceAll(`Device ${config.hardwareId}.[REDACTED]`, '[REDACTED]')
      .slice(0, 200),
  );
}

function stripControlCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
}

function formatCliError(error: unknown): string {
  if (error instanceof SimulatorError) {
    return JSON.stringify({ errorCode: error.code, errorMessage: error.message });
  }
  return JSON.stringify({
    errorCode: 'SIMULATOR_ERROR',
    errorMessage: 'Simulator berhenti karena kegagalan tidak terduga.',
  });
}

function assertNotCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function helpText(): string {
  return [
    'SiagaLongsor device telemetry simulator',
    '',
    'Environment wajib:',
    '  SIMULATOR_HARDWARE_ID',
    '  SIMULATOR_DEVICE_SECRET',
    '',
    'Options non-rahasia:',
    `  --scenario <${SIMULATOR_SCENARIOS.join('|')}>`,
    '  --count <integer; 0 berarti terus-menerus untuk presentation>',
    '  --interval <milliseconds>',
    '  --sequence-start <integer>',
    '  --help',
  ].join('\n');
}
