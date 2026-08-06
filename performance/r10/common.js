import crypto from 'k6/crypto';
import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3101/api/v1').replace(/\/$/, '');
const USER_TOKEN = __ENV.USER_TOKEN || '';
const DEVICE_HARDWARE_ID = __ENV.DEVICE_HARDWARE_ID || '';
const DEVICE_SECRET = __ENV.DEVICE_SECRET || '';
const RUN_ID = __ENV.RUN_ID || 'r10';

export function optionsFor(scenarios) {
  return {
    scenarios,
    thresholds: {
      http_req_failed: ['rate<0.01'],
      checks: ['rate>=0.99'],
      http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    },
  };
}

function uuidFor(value) {
  const hex = crypto.sha256(value, 'hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function bootIdFor(scenario) {
  return uuidFor(`${RUN_ID}:boot:${scenario}:${__VU}`);
}

function messageIdFor(scenario) {
  return uuidFor(`${RUN_ID}:message:${scenario}:${__VU}:${__ITER}:${Date.now()}`);
}

export function telemetry(scenario) {
  const messageId = messageIdFor(scenario);
  const payload = JSON.stringify({
    messageId,
    bootId: bootIdFor(scenario),
    sequence: __ITER + 1,
    timestamp: new Date().toISOString(),
    firmwareVersion: 'r10-k6-synthetic',
    network: { type: 'WIFI', signalRssi: -55 },
    readings: {
      tiltXDeg: 0,
      tiltYDeg: 0,
      tiltMagnitudeDeg: 0,
      soilMoisturePct: 10,
      rainfallMmHour: 1,
      batteryVoltage: null,
    },
  });
  return http.post(`${BASE_URL}/iot/telemetry`, payload, {
    headers: {
      Authorization: `Device ${DEVICE_HARDWARE_ID}.${DEVICE_SECRET}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': messageId,
    },
    tags: { endpoint: 'telemetry' },
  });
}

export function reads() {
  const headers = { Authorization: `Bearer ${USER_TOKEN}` };
  return [
    http.get(`${BASE_URL}/overview`, { headers, tags: { endpoint: 'overview' } }),
    http.get(`${BASE_URL}/device`, { headers, tags: { endpoint: 'device' } }),
    http.get(`${BASE_URL}/risk-profile`, { headers, tags: { endpoint: 'risk-profile' } }),
    http.get(`${BASE_URL}/audit-log?limit=25`, { headers, tags: { endpoint: 'audit-log' } }),
  ];
}

export function checkTelemetry(response) {
  return check(response, {
    'telemetry accepted': (res) => res.status === 201,
    'telemetry acknowledgement present': (res) => Boolean(res.json('telemetryId')),
  });
}

export function checkReads(responses) {
  return responses.every((response) =>
    check(response, {
      'read endpoint succeeds': (res) => res.status === 200,
      'read response has data': (res) => Boolean(res.json('data')),
    }),
  );
}
