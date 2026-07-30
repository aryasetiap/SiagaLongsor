import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export interface IssuedDeviceSecret {
  readonly raw: string;
  readonly hash: string;
  readonly issuedAt: Date;
}

@Injectable()
export class DeviceCredentialService {
  private readonly dummyHash = argon2.hash(randomBytes(32), ARGON2_OPTIONS);

  async issue(): Promise<IssuedDeviceSecret> {
    const raw = randomBytes(32).toString('base64url');
    return {
      raw,
      hash: await argon2.hash(raw, ARGON2_OPTIONS),
      issuedAt: new Date(),
    };
  }

  async verify(raw: string, hash?: string): Promise<boolean> {
    try {
      const valid = await argon2.verify(hash ?? (await this.dummyHash), raw);
      return hash === undefined ? false : valid;
    } catch {
      return false;
    }
  }
}
