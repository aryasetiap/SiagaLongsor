import { checkReads, checkTelemetry, reads, telemetry } from './common.js';
import { sleep } from 'k6';

export const options = {
  scenarios: {
    capacity: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '5m', target: 20 },
        { duration: '10m', target: 40 },
        { duration: '5m', target: 5 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    checks: ['rate>=0.99'],
    http_req_duration: ['p(99)<5000'],
  },
};

export default function () {
  checkTelemetry(telemetry('stress'));
  checkReads(reads());
  sleep(0.25);
}
