import { checkReads, checkTelemetry, optionsFor, reads, telemetry } from './common.js';

export const options = optionsFor({
  telemetry_rate: {
    exec: 'telemetry_rate',
    executor: 'constant-arrival-rate',
    rate: 2,
    timeUnit: '1s',
    duration: '15m',
    preAllocatedVUs: 4,
    maxVUs: 20,
  },
  read_rate: {
    exec: 'read_rate',
    executor: 'constant-arrival-rate',
    // Four reads per iteration gives approximately 12 read requests/second.
    rate: 3,
    timeUnit: '1s',
    duration: '15m',
    preAllocatedVUs: 8,
    maxVUs: 40,
  },
});

export function telemetry_rate() {
  checkTelemetry(telemetry('load-telemetry'));
}

export function read_rate() {
  checkReads(reads());
}
