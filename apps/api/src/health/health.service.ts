import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<{ database: boolean }> {
    const database = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return { database };
  }
}
