import { describe, expect, it } from 'vitest';

import { firmwareRiskFromRawPayload } from './firmware-assessment.js';

describe('firmwareRiskFromRawPayload', () => {
  it('treats omitted or malformed assessments as unavailable', () => {
    expect(firmwareRiskFromRawPayload({ messageId: 'physical-device-payload' })).toBeNull();
    expect(firmwareRiskFromRawPayload({ deviceAssessment: { riskLevel: 'UNKNOWN' } })).toBeNull();
  });

  it('preserves an explicit firmware UNKNOWN assessment', () => {
    expect(
      firmwareRiskFromRawPayload({
        deviceAssessment: { riskLevel: 'UNKNOWN', sirenActive: false },
      }),
    ).toBe('UNKNOWN');
  });
});
