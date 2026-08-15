import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const specificationPath = fileURLToPath(new URL('../specs/openapi.yaml', import.meta.url));
const specificationsDirectory = dirname(specificationPath);
const telemetrySchemaPath = join(specificationsDirectory, 'telemetry-payload.schema.json');
const phase02ExamplesDirectory = join(specificationsDirectory, 'examples', 'phase-02');
const phase03ExamplesDirectory = join(specificationsDirectory, 'examples', 'phase-03');
const phase04ExamplesDirectory = join(specificationsDirectory, 'examples', 'phase-04');
const phase05ExamplesDirectory = join(specificationsDirectory, 'examples', 'phase-05');
const phase06ExamplesDirectory = join(specificationsDirectory, 'examples', 'phase-06');

const expectedPhase02ExampleFiles = [
  'device-register.request.json',
  'device-register.response.json',
  'error-validation.response.json',
  'monitoring-point-create.request.json',
  'monitoring-point-list.response.json',
  'site-list.response.json',
  'telemetry-accepted.response.json',
  'telemetry-duplicate.response.json',
  'telemetry.request.json',
];
const expectedPhase03ExampleFiles = [
  'active-risk-profile.response.json',
  'alert-detail.response.json',
  'alert-list.response.json',
  'monitoring-overview.response.json',
  'risk-assessment-history.response.json',
  'risk-profile-update.request.json',
];
const expectedPhase04ExampleFiles = [
  'dashboard-summary.response.json',
  'sensor-series.response.json',
];
const expectedPhase05ExampleFiles = [
  'alert-acknowledge.request.json',
  'alert-acknowledge.response.json',
  'alert-events.response.json',
  'alert-false-alarm.request.json',
  'alert-false-alarm.response.json',
  'alert-resolve.request.json',
  'alert-resolve.response.json',
  'audit-logs.response.json',
  'realtime-event.alert-acknowledged.json',
  'realtime-event.alert-created.json',
];
const expectedPhase06ExampleFiles = [
  'map-config.response.json',
  'map-config.update.request.json',
  'map-config.update.response.json',
  'map-overview.response.json',
  'report-job.create.request.json',
  'report-job.create.response.json',
  'report-job.response.json',
  'report-jobs.response.json',
  'sop-versions.response.json',
  'sop.response.json',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function valueType(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (Number.isInteger(value)) {
    return 'integer';
  }

  return typeof value;
}

function matchesType(value, type) {
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }

  if (type === 'integer') {
    return Number.isInteger(value);
  }

  if (type === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  if (type === 'array') {
    return Array.isArray(value);
  }

  if (type === 'null') {
    return value === null;
  }

  return typeof value === type;
}

function validateExample(value, schema, path = '$') {
  assert(schema && typeof schema === 'object', `${path}: schema is missing or invalid.`);
  assert(!('$ref' in schema), `${path}: unresolved $ref remains in example schema.`);

  if (schema.allOf) {
    const merged = {
      ...schema,
      properties: {},
      required: [],
      additionalProperties: schema.unevaluatedProperties,
    };
    delete merged.allOf;
    delete merged.unevaluatedProperties;
    for (const candidate of schema.allOf) {
      Object.assign(merged.properties, candidate.properties ?? {});
      merged.required.push(...(candidate.required ?? []));
      merged.type ??= candidate.type;
    }
    merged.required = [...new Set(merged.required)];
    validateExample(value, merged, path);
    return;
  }

  if (schema.oneOf) {
    const results = schema.oneOf.map((candidate) => {
      try {
        validateExample(value, candidate, path);
        return true;
      } catch {
        return false;
      }
    });
    assert(results.filter(Boolean).length === 1, `${path}: must match exactly one oneOf branch.`);
    return;
  }

  if ('const' in schema) {
    assert(Object.is(value, schema.const), `${path}: must equal ${JSON.stringify(schema.const)}.`);
  }

  if (schema.enum) {
    assert(
      schema.enum.some((entry) => Object.is(entry, value)),
      `${path}: value is not in enum.`,
    );
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(
      allowedTypes.some((type) => matchesType(value, type)),
      `${path}: expected ${allowedTypes.join('|')}, received ${valueType(value)}.`,
    );
  }

  if (value === null) {
    return;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined) {
      assert(value.length >= schema.minLength, `${path}: shorter than minLength.`);
    }
    if (schema.maxLength !== undefined) {
      assert(value.length <= schema.maxLength, `${path}: longer than maxLength.`);
    }
    if (schema.pattern) {
      assert(new RegExp(schema.pattern).test(value), `${path}: does not match pattern.`);
    }
    if (schema.format === 'date-time') {
      assert(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
          !Number.isNaN(Date.parse(value)),
        `${path}: must be an ISO 8601 UTC date-time.`,
      );
    }
  }

  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path}: must be finite.`);
    if (schema.minimum !== undefined) {
      assert(value >= schema.minimum, `${path}: below minimum.`);
    }
    if (schema.maximum !== undefined) {
      assert(value <= schema.maximum, `${path}: above maximum.`);
    }
    if (schema.exclusiveMinimum !== undefined) {
      assert(value > schema.exclusiveMinimum, `${path}: not above exclusiveMinimum.`);
    }
    if (schema.exclusiveMaximum !== undefined) {
      assert(value < schema.exclusiveMaximum, `${path}: not below exclusiveMaximum.`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) {
      assert(value.length >= schema.minItems, `${path}: fewer than minItems.`);
    }
    if (schema.prefixItems) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length) {
          validateExample(value[index], itemSchema, `${path}[${index}]`);
        }
      });
    }
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => validateExample(item, schema.items, `${path}[${index}]`));
    }
    if (schema.uniqueItems === true) {
      const encoded = value.map((item) => JSON.stringify(item));
      assert(new Set(encoded).size === encoded.length, `${path}: items must be unique.`);
    }
    return;
  }

  if (typeof value === 'object') {
    const properties = schema.properties ?? {};
    for (const requiredProperty of schema.required ?? []) {
      assert(
        Object.hasOwn(value, requiredProperty),
        `${path}.${requiredProperty}: required property is missing.`,
      );
    }
    if (schema.minProperties !== undefined) {
      assert(
        Object.keys(value).length >= schema.minProperties,
        `${path}: fewer than minProperties.`,
      );
    }
    if (schema.additionalProperties === false) {
      for (const property of Object.keys(value)) {
        assert(Object.hasOwn(properties, property), `${path}.${property}: additional property.`);
      }
    }
    for (const [property, propertyValue] of Object.entries(value)) {
      if (properties[property]) {
        validateExample(propertyValue, properties[property], `${path}.${property}`);
      }
    }
  }
}

function assertJsonSchemaShape(schema, path = '$') {
  assert(schema && typeof schema === 'object', `${path}: JSON Schema node must be an object.`);
  if (schema.type) {
    const supportedTypes = new Set([
      'array',
      'boolean',
      'integer',
      'null',
      'number',
      'object',
      'string',
    ]);
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(
      types.every((type) => supportedTypes.has(type)),
      `${path}: invalid JSON Schema type.`,
    );
  }
  if (schema.required) {
    assert(
      Array.isArray(schema.required) &&
        schema.required.every((property) => typeof property === 'string'),
      `${path}.required must be an array of strings.`,
    );
  }
  if (schema.properties) {
    assert(
      schema.properties &&
        typeof schema.properties === 'object' &&
        !Array.isArray(schema.properties),
      `${path}.properties must be an object.`,
    );
    for (const [property, childSchema] of Object.entries(schema.properties)) {
      assertJsonSchemaShape(childSchema, `${path}.properties.${property}`);
    }
  }
  if (schema.items) {
    assertJsonSchemaShape(schema.items, `${path}.items`);
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (schema[keyword]) {
      assert(Array.isArray(schema[keyword]), `${path}.${keyword} must be an array.`);
      schema[keyword].forEach((child, index) =>
        assertJsonSchemaShape(child, `${path}.${keyword}[${index}]`),
      );
    }
  }
}

function containsProperty(value, forbiddenProperty) {
  if (Array.isArray(value)) {
    return value.some((entry) => containsProperty(entry, forbiddenProperty));
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    Object.hasOwn(value, forbiddenProperty) ||
    Object.values(value).some((entry) => containsProperty(entry, forbiddenProperty))
  );
}

function hasParameterReference(operation, reference) {
  return operation.parameters?.some((parameter) => parameter.$ref === reference) ?? false;
}

function responseHasRequestId(specification, response) {
  if (response.$ref) {
    const responseName = response.$ref.split('/').at(-1);
    return Boolean(specification.components.responses[responseName]?.headers?.['x-request-id']);
  }
  return Boolean(response.headers?.['x-request-id']);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

try {
  const [
    rawSpecification,
    telemetrySchema,
    phase02ExampleFileNames,
    phase03ExampleFileNames,
    phase04ExampleFileNames,
    phase05ExampleFileNames,
    phase06ExampleFileNames,
  ] = await Promise.all([
    SwaggerParser.parse(specificationPath),
    readJson(telemetrySchemaPath),
    readdir(phase02ExamplesDirectory),
    readdir(phase03ExamplesDirectory),
    readdir(phase04ExamplesDirectory),
    readdir(phase05ExamplesDirectory),
    readdir(phase06ExamplesDirectory),
  ]);

  assert(rawSpecification.openapi === '3.1.0', 'OpenAPI version must be 3.1.0.');
  assert(
    rawSpecification.paths['/iot/telemetry'].post.requestBody.content['application/json'].schema
      .$ref === './telemetry-payload.schema.json',
    'Telemetry request must reference the canonical external JSON Schema.',
  );
  assert(
    !Object.hasOwn(rawSpecification.components.schemas, 'TelemetryPayload'),
    'OpenAPI must not duplicate TelemetryPayload in components.',
  );
  assert(!Object.hasOwn(rawSpecification.paths, '/iot/heartbeat'), 'Heartbeat is not in Phase 02.');
  assert(
    rawSpecification.components.securitySchemes.deviceAuth.type === 'apiKey' &&
      rawSpecification.components.securitySchemes.deviceAuth.in === 'header' &&
      rawSpecification.components.securitySchemes.deviceAuth.name === 'Authorization',
    'Device authentication must be an apiKey scheme in the Authorization header.',
  );
  assert(
    rawSpecification.components.parameters.OrganizationId.name === 'X-Organization-Id' &&
      rawSpecification.components.parameters.OrganizationId.required === true,
    'Required X-Organization-Id parameter is missing.',
  );

  const expectedUserOperations = {
    '/sites': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
    },
    '/monitoring-points': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
      post: ['PROJECT_OWNER'],
    },
    '/monitoring-points/{monitoringPointId}': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
      patch: ['PROJECT_OWNER'],
    },
    '/devices': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
      post: ['PROJECT_OWNER'],
    },
    '/devices/{deviceId}': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
      patch: ['PROJECT_OWNER'],
    },
    '/devices/{deviceId}/rotate-credential': {
      post: ['PROJECT_OWNER'],
    },
    '/devices/{deviceId}/disable': {
      post: ['PROJECT_OWNER'],
    },
    '/sites/{siteId}/risk-profile': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
      put: ['PROJECT_OWNER'],
    },
  };
  for (const [path, methods] of Object.entries(expectedUserOperations)) {
    for (const [method, expectedRoles] of Object.entries(methods)) {
      const operation = rawSpecification.paths[path]?.[method];
      assert(operation, `Required user operation is missing: ${method.toUpperCase()} ${path}`);
      assert(
        hasParameterReference(operation, '#/components/parameters/OrganizationId'),
        `${method.toUpperCase()} ${path} must require X-Organization-Id.`,
      );
      assert(
        JSON.stringify(operation['x-required-roles']) === JSON.stringify(expectedRoles),
        `${method.toUpperCase()} ${path} has an incorrect permission matrix.`,
      );
      for (const [status, response] of Object.entries(operation.responses)) {
        assert(
          responseHasRequestId(rawSpecification, response),
          `${method.toUpperCase()} ${path} response ${status} must declare x-request-id.`,
        );
      }
    }
  }

  const siteListOperation = rawSpecification.paths['/sites'].get;
  assert(
    JSON.stringify(siteListOperation.security) === JSON.stringify([{ bearerAuth: [] }]),
    'GET /sites must require bearer authentication.',
  );
  assert(
    hasParameterReference(siteListOperation, '#/components/parameters/Limit') &&
      hasParameterReference(siteListOperation, '#/components/parameters/Cursor') &&
      hasParameterReference(siteListOperation, '#/components/parameters/SiteSort'),
    'GET /sites must declare limit, cursor, and Site sort parameters.',
  );
  const siteSearchParameter = siteListOperation.parameters.find(
    (parameter) => parameter.name === 'search' && parameter.in === 'query',
  );
  assert(
    siteSearchParameter?.required !== true && siteSearchParameter?.schema?.maxLength === 100,
    'GET /sites search must be optional with maxLength 100.',
  );
  assert(
    rawSpecification.components.parameters.SiteSort.schema.default === 'name:asc' &&
      JSON.stringify(rawSpecification.components.parameters.SiteSort.schema.enum) ===
        JSON.stringify(['name:asc', 'name:desc', 'createdAt:desc']),
    'GET /sites sort contract is incorrect.',
  );
  for (const forbiddenFragment of [
    '/notifications',
    '/websocket',
    '/siren',
    '/iot/heartbeat',
    '/firmware',
  ]) {
    assert(
      !Object.keys(rawSpecification.paths).some((path) => path.includes(forbiddenFragment)),
      `Deferred capability leaked into OpenAPI: ${forbiddenFragment}`,
    );
  }

  assert(
    telemetrySchema.$schema === 'https://json-schema.org/draft/2020-12/schema',
    'Telemetry schema must declare JSON Schema draft 2020-12.',
  );
  assertJsonSchemaShape(telemetrySchema);
  assert(telemetrySchema.additionalProperties === false, 'Telemetry root must be strict.');
  assert(telemetrySchema.required.includes('bootId'), 'bootId must be required.');
  assert(
    !Object.hasOwn(telemetrySchema.properties, 'deviceId') &&
      !Object.hasOwn(telemetrySchema.properties, 'hardwareId'),
    'Telemetry body must not contain deviceId or hardwareId.',
  );
  assert(
    !Object.hasOwn(telemetrySchema.properties.readings.properties.rainfallMmHour, 'maximum'),
    'rainfallMmHour must not define a static maximum.',
  );

  const sortedPhase02Examples = phase02ExampleFileNames
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert(
    JSON.stringify(sortedPhase02Examples) === JSON.stringify(expectedPhase02ExampleFiles),
    `Phase 02 example set differs from the expected files: ${sortedPhase02Examples.join(', ')}`,
  );
  const sortedPhase03Examples = phase03ExampleFileNames
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert(
    JSON.stringify(sortedPhase03Examples) === JSON.stringify(expectedPhase03ExampleFiles),
    `Phase 03 example set differs from the expected files: ${sortedPhase03Examples.join(', ')}`,
  );
  const sortedPhase04Examples = phase04ExampleFileNames
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert(
    JSON.stringify(sortedPhase04Examples) === JSON.stringify(expectedPhase04ExampleFiles),
    `Phase 04 example set differs from the expected files: ${sortedPhase04Examples.join(', ')}`,
  );
  const sortedPhase05Examples = phase05ExampleFileNames
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert(
    JSON.stringify(sortedPhase05Examples) === JSON.stringify(expectedPhase05ExampleFiles),
    `Phase 05 example set differs from the expected files: ${sortedPhase05Examples.join(', ')}`,
  );
  const sortedPhase06Examples = phase06ExampleFileNames
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert(
    JSON.stringify(sortedPhase06Examples) === JSON.stringify(expectedPhase06ExampleFiles),
    `Phase 06 example set differs from the expected files: ${sortedPhase06Examples.join(', ')}`,
  );

  await SwaggerParser.validate(specificationPath);
  const dereferenced = await SwaggerParser.dereference(specificationPath);
  const schemas = dereferenced.components.schemas;
  const phase02Examples = Object.fromEntries(
    await Promise.all(
      expectedPhase02ExampleFiles.map(async (name) => [
        name,
        await readJson(join(phase02ExamplesDirectory, name)),
      ]),
    ),
  );
  const phase03Examples = Object.fromEntries(
    await Promise.all(
      expectedPhase03ExampleFiles.map(async (name) => [
        name,
        await readJson(join(phase03ExamplesDirectory, name)),
      ]),
    ),
  );
  const phase04Examples = Object.fromEntries(
    await Promise.all(
      expectedPhase04ExampleFiles.map(async (name) => [
        name,
        await readJson(join(phase04ExamplesDirectory, name)),
      ]),
    ),
  );
  const phase05Examples = Object.fromEntries(
    await Promise.all(
      expectedPhase05ExampleFiles.map(async (name) => [
        name,
        await readJson(join(phase05ExamplesDirectory, name)),
      ]),
    ),
  );
  const phase06Examples = Object.fromEntries(
    await Promise.all(
      expectedPhase06ExampleFiles.map(async (name) => [
        name,
        await readJson(join(phase06ExamplesDirectory, name)),
      ]),
    ),
  );

  const telemetryRequestSchema =
    dereferenced.paths['/iot/telemetry'].post.requestBody.content['application/json'].schema;
  assert(
    JSON.stringify(telemetryRequestSchema) === JSON.stringify(telemetrySchema),
    'Resolved telemetry request schema drifted from the canonical JSON Schema.',
  );
  assert(
    !containsProperty(schemas.Device, 'secret') &&
      !containsProperty(schemas.DeviceSummary, 'secret'),
    'Device read schemas must not expose a secret.',
  );
  validateExample(phase02Examples['error-validation.response.json'], schemas.ErrorResponse);
  validateExample(
    phase02Examples['monitoring-point-list.response.json'],
    schemas.MonitoringPointListResponse,
  );
  validateExample(
    phase02Examples['monitoring-point-create.request.json'],
    schemas.CreateMonitoringPointRequest,
  );
  validateExample(phase02Examples['site-list.response.json'], schemas.SiteListResponse);
  validateExample(phase02Examples['device-register.request.json'], schemas.RegisterDeviceRequest);
  validateExample(
    phase02Examples['device-register.response.json'],
    schemas.DeviceCredentialResponse,
  );
  validateExample(phase02Examples['telemetry.request.json'], telemetryRequestSchema);
  validateExample(phase02Examples['telemetry-accepted.response.json'], schemas.TelemetryAccepted);
  validateExample(phase02Examples['telemetry-duplicate.response.json'], schemas.TelemetryAccepted);
  validateExample(
    phase03Examples['active-risk-profile.response.json'],
    schemas.RiskProfileResponse,
  );
  validateExample(
    phase03Examples['risk-profile-update.request.json'],
    schemas.UpdateRiskProfileRequest,
  );
  validateExample(
    phase03Examples['monitoring-overview.response.json'],
    schemas.MonitoringOverviewResponse,
  );
  validateExample(
    phase03Examples['risk-assessment-history.response.json'],
    schemas.RiskAssessmentListResponse,
  );
  validateExample(phase03Examples['alert-list.response.json'], schemas.AlertListResponse);
  validateExample(phase03Examples['alert-detail.response.json'], schemas.AlertResponse);
  validateExample(
    phase04Examples['dashboard-summary.response.json'],
    schemas.DashboardSummaryResponse,
  );
  validateExample(phase04Examples['sensor-series.response.json'], schemas.SensorSeriesResponse);
  validateExample(
    phase05Examples['alert-acknowledge.request.json'],
    schemas.AcknowledgeAlertRequest,
  );
  validateExample(phase05Examples['alert-resolve.request.json'], schemas.ResolveAlertRequest);
  validateExample(
    phase05Examples['alert-false-alarm.request.json'],
    schemas.FalseAlarmAlertRequest,
  );
  for (const name of [
    'alert-acknowledge.response.json',
    'alert-resolve.response.json',
    'alert-false-alarm.response.json',
  ]) {
    validateExample(phase05Examples[name], schemas.AlertMutationResponse);
  }
  validateExample(phase05Examples['alert-events.response.json'], schemas.AlertEventListResponse);
  validateExample(phase05Examples['audit-logs.response.json'], schemas.AuditLogListResponse);
  validateExample(phase05Examples['realtime-event.alert-created.json'], schemas.RealtimeEvent);
  validateExample(phase05Examples['realtime-event.alert-acknowledged.json'], schemas.RealtimeEvent);
  validateExample(
    phase06Examples['map-config.response.json'],
    schemas.SiteMapConfigurationResponse,
  );
  validateExample(
    phase06Examples['map-config.update.request.json'],
    schemas.UpdateSiteMapConfigurationRequest,
  );
  validateExample(
    phase06Examples['map-config.update.response.json'],
    schemas.SiteMapConfigurationMutationResponse,
  );
  validateExample(phase06Examples['map-overview.response.json'], schemas.MapOverviewResponse);
  validateExample(phase06Examples['sop.response.json'], schemas.SopDocumentResponse);
  validateExample(phase06Examples['sop-versions.response.json'], schemas.SopDocumentListResponse);
  validateExample(
    phase06Examples['report-job.create.request.json'],
    schemas.CreateReportJobRequest,
  );
  validateExample(phase06Examples['report-job.create.response.json'], schemas.ReportJobResponse);
  validateExample(phase06Examples['report-job.response.json'], schemas.ReportJobResponse);
  validateExample(phase06Examples['report-jobs.response.json'], schemas.ReportJobListResponse);

  assert(
    phase02Examples['telemetry-accepted.response.json'].duplicate === false &&
      phase02Examples['telemetry-duplicate.response.json'].duplicate === true,
    'Telemetry acknowledgement examples must distinguish new and duplicate payloads.',
  );
  assert(
    !containsProperty(rawSpecification.components.schemas.TelemetryAccepted, 'serverRisk') &&
      !containsProperty(phase02Examples['telemetry-accepted.response.json'], 'serverRisk') &&
      !containsProperty(phase02Examples['telemetry-duplicate.response.json'], 'serverRisk'),
    'Phase 02 telemetry acknowledgement must remain free of serverRisk.',
  );
  assert(
    !containsProperty(phase02Examples['telemetry.request.json'], 'deviceId') &&
      !containsProperty(phase02Examples['telemetry.request.json'], 'hardwareId'),
    'Telemetry example must not contain device identity.',
  );
  assert(
    phase02Examples['device-register.response.json'].data.credential.secret ===
      'EXAMPLE_ONLY_NOT_A_REAL_CREDENTIAL_000000',
    'Credential example must use the approved non-secret placeholder.',
  );
  for (const name of [
    'monitoring-point-list.response.json',
    'telemetry-accepted.response.json',
    'telemetry-duplicate.response.json',
  ]) {
    assert(
      !containsProperty(phase02Examples[name], 'secret'),
      `${name} must not expose a device secret.`,
    );
  }

  const activeProfile = phase03Examples['active-risk-profile.response.json'].data;
  const profileUpdate = phase03Examples['risk-profile-update.request.json'];
  assert(
    activeProfile.version === 1 &&
      activeProfile.calibrationStatus === 'PROVISIONAL' &&
      activeProfile.thresholds.safe.tiltMagnitudeDegLt === 3 &&
      activeProfile.thresholds.safe.soilMoisturePctLt === 65 &&
      activeProfile.thresholds.safe.rainfallMmHourLt === 20 &&
      activeProfile.thresholds.danger.tiltMagnitudeDegGt === 8 &&
      activeProfile.thresholds.danger.rainfallMmHourGt === 50 &&
      activeProfile.thresholds.danger.soilMoisturePctGt === 85 &&
      activeProfile.freshness.onlineWithinMinutes === 20 &&
      activeProfile.freshness.offlineAfterMinutes === 35 &&
      activeProfile.hysteresis.watchConsecutiveSamples === 2 &&
      activeProfile.hysteresis.dangerConsecutiveSamples === 1 &&
      activeProfile.hysteresis.downgradeStableMinutes === 10 &&
      activeProfile.hysteresis.mismatchConsecutiveSamples === 3,
    'Phase 03 active profile example must preserve the approved provisional version 1 defaults.',
  );
  assert(
    JSON.stringify({
      calibrationStatus: activeProfile.calibrationStatus,
      thresholds: activeProfile.thresholds,
      technicalRanges: activeProfile.technicalRanges,
      freshness: activeProfile.freshness,
      hysteresis: activeProfile.hysteresis,
      notes: activeProfile.notes,
    }) === JSON.stringify(profileUpdate),
    'Risk profile update example must canonically match the active configuration for no-op testing.',
  );
  assert(
    JSON.stringify(rawSpecification.components.schemas.RiskLevel.enum) ===
      JSON.stringify(['SAFE', 'WATCH', 'WARNING', 'DANGER', 'UNKNOWN']) &&
      JSON.stringify(rawSpecification.components.schemas.ConnectivityStatus.enum) ===
        JSON.stringify(['ONLINE', 'DELAYED', 'OFFLINE', 'UNKNOWN']),
    'Risk and connectivity enums drifted from the approved operational-status contract.',
  );
  assert(
    JSON.stringify(rawSpecification.components.schemas.AlertStatus.enum) ===
      JSON.stringify(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM']),
    'Alert status contract is incorrect.',
  );
  for (const [name, schema] of [
    ['MonitoringOverviewResponse', schemas.MonitoringOverviewResponse],
    ['RiskAssessmentListResponse', schemas.RiskAssessmentListResponse],
    ['AlertListResponse', schemas.AlertListResponse],
  ]) {
    assert(!containsProperty(schema, 'totalCount'), `${name} must not expose totalCount.`);
  }
  for (const name of [
    'monitoring-overview.response.json',
    'risk-assessment-history.response.json',
    'alert-list.response.json',
  ]) {
    assert(!containsProperty(phase03Examples[name], 'totalCount'), `${name} must omit totalCount.`);
  }
  assert(
    phase03Examples['risk-assessment-history.response.json'].data.some(
      (assessment) => assessment.affectsCurrentState === false,
    ),
    'Risk assessment history example must include late historical evaluation semantics.',
  );

  const summarySchema = schemas.DashboardSummary;
  assert(
    JSON.stringify(summarySchema.required) ===
      JSON.stringify([
        'generatedAt',
        'window',
        'monitoringPoints',
        'riskDistribution',
        'devices',
        'connectivityDistribution',
        'alerts',
      ]) &&
      JSON.stringify(schemas.RiskDistribution.required) ===
        JSON.stringify(['safe', 'watch', 'danger', 'unknown']) &&
      JSON.stringify(schemas.ConnectivityDistribution.required) ===
        JSON.stringify(['online', 'delayed', 'offline', 'unknown']),
    'Dashboard summary must expose the exact aggregate shape and all distribution buckets.',
  );
  for (const [name, schema] of [
    ['DashboardSummaryResponse', schemas.DashboardSummaryResponse],
    ['SensorSeriesResponse', schemas.SensorSeriesResponse],
  ]) {
    assert(!containsProperty(schema, 'totalCount'), `${name} must not expose totalCount.`);
    for (const forbidden of [
      'secret',
      'credential',
      'credentialHash',
      'rawPayload',
      'authorization',
    ]) {
      assert(!containsProperty(schema, forbidden), `${name} must not expose ${forbidden}.`);
    }
  }

  const summary = phase04Examples['dashboard-summary.response.json'].data;
  assert(
    summary.window.to === summary.generatedAt &&
      Date.parse(summary.window.to) - Date.parse(summary.window.from) ===
        summary.window.hours * 60 * 60_000,
    'Dashboard example window must end at generatedAt and match windowHours.',
  );
  assert(
    summary.monitoringPoints.active + summary.monitoringPoints.inactive ===
      summary.monitoringPoints.total &&
      Object.values(summary.riskDistribution).reduce((total, value) => total + value, 0) ===
        summary.monitoringPoints.active &&
      summary.devices.enabled + summary.devices.disabled === summary.devices.total &&
      Object.values(summary.connectivityDistribution).reduce((total, value) => total + value, 0) ===
        summary.devices.enabled &&
      summary.alerts.activeCritical <= summary.alerts.active,
    'Dashboard example violates an aggregate invariant.',
  );

  const sensorPage = phase04Examples['sensor-series.response.json'].data;
  assert(
    sensorPage.hasMore === true &&
      typeof sensorPage.nextCursor === 'string' &&
      sensorPage.nextCursor.length > 0,
    'Sensor series example must demonstrate an opaque next page cursor.',
  );
  assert(
    sensorPage.items.some((point) => point.isLate === true) &&
      sensorPage.items.some((point) => point.batteryVoltage === null),
    'Sensor series example must demonstrate late telemetry and nullable battery.',
  );
  const sensorBoundaries = sensorPage.items.map((point) => [point.recordedAt, point.telemetryId]);
  assert(
    JSON.stringify(sensorBoundaries) ===
      JSON.stringify(
        [...sensorBoundaries].sort(([leftTime, leftId], [rightTime, rightId]) =>
          leftTime === rightTime
            ? leftId.localeCompare(rightId)
            : leftTime.localeCompare(rightTime),
        ),
      ),
    'Sensor series example must be ordered by recordedAt and telemetryId ascending.',
  );
  assert(
    sensorPage.items.some(
      (point, index) =>
        index > 0 &&
        Date.parse(point.recordedAt) - Date.parse(sensorPage.items[index - 1].recordedAt) >
          10 * 60_000,
    ),
    'Sensor series example must visibly preserve a time gap without interpolation.',
  );
  for (const exampleName of expectedPhase04ExampleFiles) {
    assert(
      !containsProperty(phase04Examples[exampleName], 'totalCount'),
      `${exampleName} must omit totalCount.`,
    );
    for (const forbidden of [
      'secret',
      'credential',
      'credentialHash',
      'rawPayload',
      'Authorization',
    ]) {
      assert(
        !containsProperty(phase04Examples[exampleName], forbidden),
        `${exampleName} must not contain ${forbidden}.`,
      );
    }
  }

  assert(
    phase05Examples['alert-acknowledge.response.json'].data.status === 'ACKNOWLEDGED' &&
      phase05Examples['alert-resolve.response.json'].data.status === 'RESOLVED' &&
      phase05Examples['alert-false-alarm.response.json'].data.status === 'FALSE_ALARM',
    'Phase 05 action examples must demonstrate the approved lifecycle transitions.',
  );
  assert(
    phase05Examples['alert-acknowledge.request.json'].actionId ===
      phase05Examples['alert-acknowledge.response.json'].action.actionId &&
      phase05Examples['alert-resolve.request.json'].actionId ===
        phase05Examples['alert-resolve.response.json'].action.actionId &&
      phase05Examples['alert-false-alarm.request.json'].actionId ===
        phase05Examples['alert-false-alarm.response.json'].action.actionId,
    'Every action response must preserve the client actionId.',
  );
  for (const [name, schema] of [
    ['AlertEventListResponse', schemas.AlertEventListResponse],
    ['AuditLogListResponse', schemas.AuditLogListResponse],
  ]) {
    assert(!containsProperty(schema, 'totalCount'), `${name} must not expose totalCount.`);
  }
  for (const exampleName of expectedPhase05ExampleFiles) {
    assert(
      !containsProperty(phase05Examples[exampleName], 'totalCount'),
      `${exampleName} must omit totalCount.`,
    );
    for (const forbidden of [
      'secret',
      'credential',
      'credentialHash',
      'rawPayload',
      'Authorization',
      'ipAddress',
      'userAgent',
      'accessToken',
      'refreshToken',
    ]) {
      assert(
        !containsProperty(phase05Examples[exampleName], forbidden),
        `${exampleName} must not contain ${forbidden}.`,
      );
    }
  }

  process.stdout.write(
    `OpenAPI, external telemetry schema, ${expectedPhase02ExampleFiles.length} Phase 02 examples, ${expectedPhase03ExampleFiles.length} Phase 03 examples, ${expectedPhase04ExampleFiles.length} Phase 04 examples, ${expectedPhase05ExampleFiles.length} Phase 05 examples, and ${expectedPhase06ExampleFiles.length} Phase 06 examples are valid.\n`,
  );
} catch (error) {
  process.stderr.write('OpenAPI contract validation failed.\n');
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown validation error.'}\n`);
  process.exitCode = 1;
}
