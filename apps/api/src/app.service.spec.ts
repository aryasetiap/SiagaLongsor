import { describe, expect, it } from 'vitest';

import { AppService } from './app.service.js';

describe('AppService', () => {
  it('reports the foundation checkpoint without exposing runtime internals', () => {
    const service = new AppService();

    expect(service.getFoundationStatus()).toEqual({
      name: 'SiagaLongsor API',
      phase: '01-foundation',
    });
  });
});
