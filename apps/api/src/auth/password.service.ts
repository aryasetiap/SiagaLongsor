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

@Injectable()
export class PasswordService {
  private readonly dummyHash = argon2.hash(randomBytes(32), ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(password: string, passwordHash?: string): Promise<boolean> {
    const hash = passwordHash ?? (await this.dummyHash);

    try {
      const valid = await argon2.verify(hash, password);
      return passwordHash === undefined ? false : valid;
    } catch {
      return false;
    }
  }
}
