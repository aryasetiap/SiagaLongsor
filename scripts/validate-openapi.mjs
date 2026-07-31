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
    if (schema.items) {
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
  const [rawSpecification, telemetrySchema, phase02ExampleFileNames, phase03ExampleFileNames] =
    await Promise.all([
      SwaggerParser.parse(specificationPath),
      readJson(telemetrySchemaPath),
      readdir(phase02ExamplesDirectory),
      readdir(phase03ExamplesDirectory),
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
    '/monitoring-overview': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
    },
    '/monitoring-points/{monitoringPointId}/risk-assessments': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
    },
    '/alerts': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
    },
    '/alerts/{alertId}': {
      get: ['PROJECT_OWNER', 'SCHOOL_ADMIN'],
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
  assert(
    ['post', 'put', 'patch', 'delete'].every(
      (method) => !Object.hasOwn(rawSpecification.paths['/sites'], method),
    ) && !Object.hasOwn(rawSpecification.paths, '/sites/{siteId}'),
    'Phase 02 must not expose Site create, detail, update, or delete operations.',
  );

  const phase03ListPaths = [
    '/monitoring-overview',
    '/monitoring-points/{monitoringPointId}/risk-assessments',
    '/alerts',
  ];
  for (const path of phase03ListPaths) {
    const operation = rawSpecification.paths[path].get;
    assert(
      hasParameterReference(operation, '#/components/parameters/Limit') &&
        hasParameterReference(operation, '#/components/parameters/Cursor'),
      `GET ${path} must declare limit and opaque cursor pagination.`,
    );
  }
  assert(
    JSON.stringify(rawSpecification.paths['/monitoring-overview'].get.security) ===
      JSON.stringify([{ bearerAuth: [] }]) &&
      JSON.stringify(
        rawSpecification.paths['/monitoring-points/{monitoringPointId}/risk-assessments'].get
          .security,
      ) === JSON.stringify([{ bearerAuth: [] }]) &&
      JSON.stringify(rawSpecification.paths['/alerts'].get.security) ===
        JSON.stringify([{ bearerAuth: [] }]) &&
      JSON.stringify(rawSpecification.paths['/alerts/{alertId}'].get.security) ===
        JSON.stringify([{ bearerAuth: [] }]),
    'Every Phase 03 read operation must require bearer authentication.',
  );
  const riskProfilePut = rawSpecification.paths['/sites/{siteId}/risk-profile'].put;
  assert(
    riskProfilePut['x-versioning-semantics'] === 'immutable-new-version-or-no-op' &&
      riskProfilePut.responses['200'].content['application/json'].schema.$ref ===
        '#/components/schemas/RiskProfileMutationResponse',
    'Risk profile PUT must declare immutable new-version-or-no-op semantics.',
  );
  assert(
    ['post', 'put', 'patch', 'delete'].every(
      (method) => !Object.hasOwn(rawSpecification.paths['/alerts'], method),
    ) &&
      ['post', 'put', 'patch', 'delete'].every(
        (method) => !Object.hasOwn(rawSpecification.paths['/alerts/{alertId}'], method),
      ),
    'Phase 03 Alert contract must be read-only.',
  );
  for (const forbiddenPath of [
    '/dashboard/summary',
    '/alerts/{alertId}/acknowledge',
    '/alerts/{alertId}/resolve',
    '/alerts/{alertId}/false-alarm',
    '/threshold-profiles/{profileId}/activate',
    '/notifications',
    '/events',
    '/iot/heartbeat',
  ]) {
    assert(
      !Object.hasOwn(rawSpecification.paths, forbiddenPath),
      `Deferred endpoint must not be present in Phase 03: ${forbiddenPath}`,
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
      JSON.stringify(['SAFE', 'WATCH', 'DANGER', 'UNKNOWN']) &&
      JSON.stringify(rawSpecification.components.schemas.ConnectivityStatus.enum) ===
        JSON.stringify(['ONLINE', 'DELAYED', 'OFFLINE', 'UNKNOWN']),
    'Risk and connectivity enums drifted from the approved Phase 03 contract.',
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

  process.stdout.write(
    `OpenAPI, external telemetry schema, ${expectedPhase02ExampleFiles.length} Phase 02 examples, and ${expectedPhase03ExampleFiles.length} Phase 03 examples are valid.\n`,
  );
} catch (error) {
  process.stderr.write('OpenAPI contract validation failed.\n');
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown validation error.'}\n`);
  process.exitCode = 1;
}
