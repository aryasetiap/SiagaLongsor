import { describe, expect, it } from 'vitest';

import { nationalWarningLevelByRisk } from './national-warning-level.js';

describe('nationalWarningLevelByRisk', () => {
  it('maps the backward-compatible risk enum to three Indonesian warning levels', () => {
    expect(nationalWarningLevelByRisk).toEqual({
      SAFE: { level: null, label: 'AMAN', displayLabel: 'AMAN' },
      WATCH: { level: 1, label: 'WASPADA', displayLabel: 'WASPADA (TINGKAT 1)' },
      WARNING: { level: 2, label: 'SIAGA', displayLabel: 'SIAGA (TINGKAT 2)' },
      DANGER: { level: 3, label: 'AWAS', displayLabel: 'AWAS (TINGKAT 3)' },
      UNKNOWN: {
        level: null,
        label: 'TIDAK DIKETAHUI',
        displayLabel: 'TIDAK DIKETAHUI',
      },
    });
  });
});
