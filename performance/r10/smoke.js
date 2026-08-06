import { sleep } from 'k6';
import { checkReads, checkTelemetry, optionsFor, reads, telemetry } from './common.js';

export const options = optionsFor({
  smoke: { executor: 'constant-vus', vus: 1, duration: '2m' },
});

export default function () {
  checkTelemetry(telemetry('smoke'));
  checkReads(reads());
  // Keep the one-VU smoke below the API's per-device telemetry rate limit.
  sleep(2);
}
