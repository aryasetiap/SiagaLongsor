import { describe, expect, it } from 'vitest';

import { foundationStatus } from './foundation';

describe('foundationStatus', () => {
  it('does not present the foundation shell as an operational dashboard', () => {
    expect(foundationStatus).toEqual({
      checkpoint: 'phase-01-task-01-02',
      isOperationalDashboard: false,
    });
  });
});
