import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { z } from 'zod';

import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const requiredText = z.string().trim().min(1);
const seedEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  SEED_ORGANIZATION_NAME: requiredText,
  SEED_ORGANIZATION_SLUG: requiredText,
  SEED_SITE_NAME: requiredText,
  SEED_SITE_SLUG: requiredText,
  SEED_PROJECT_OWNER_NAME: requiredText,
  SEED_PROJECT_OWNER_EMAIL: z.email(),
  SEED_PROJECT_OWNER_PASSWORD: z.string().min(12),
  SEED_SCHOOL_ADMIN_NAME: requiredText,
  SEED_SCHOOL_ADMIN_EMAIL: z.email(),
  SEED_SCHOOL_ADMIN_PASSWORD: z.string().min(12),
});

const parsedEnvironment = seedEnvironmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidFields = parsedEnvironment.error.issues.map((issue) => issue.path.join('.'));
  throw new Error(`Seed environment tidak valid pada field: ${invalidFields.join(', ')}`);
}

const environment = parsedEnvironment.data;
const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const developmentMonitoringPointId = 'seed_sman17_primary_monitoring_point';
const developmentRiskProfileId = 'seed_sman17_risk_profile_v1';

interface SeedUser {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly role: Role;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function runSeed(): Promise<void> {
  const result = await prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.upsert({
      where: { slug: environment.SEED_ORGANIZATION_SLUG },
      update: { name: environment.SEED_ORGANIZATION_NAME },
      create: {
        name: environment.SEED_ORGANIZATION_NAME,
        slug: environment.SEED_ORGANIZATION_SLUG,
      },
    });

    const site = await transaction.site.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: environment.SEED_SITE_SLUG,
        },
      },
      update: { name: environment.SEED_SITE_NAME },
      create: {
        name: environment.SEED_SITE_NAME,
        organizationId: organization.id,
        slug: environment.SEED_SITE_SLUG,
        timezone: 'Asia/Jakarta',
      },
    });

    const monitoringPoint = await transaction.monitoringPoint.upsert({
      where: { id: developmentMonitoringPointId },
      update: {
        description: 'Titik pemantauan development awal.',
        isActive: true,
        locationDescription: 'Lereng belakang gedung utama.',
        name: 'Lereng Belakang Gedung Utama',
        organizationId: organization.id,
        siteId: site.id,
      },
      create: {
        description: 'Titik pemantauan development awal.',
        id: developmentMonitoringPointId,
        isActive: true,
        locationDescription: 'Lereng belakang gedung utama.',
        name: 'Lereng Belakang Gedung Utama',
        organizationId: organization.id,
        siteId: site.id,
      },
    });

    const existingRiskProfile = await transaction.riskProfile.findUnique({
      where: { siteId_version: { siteId: site.id, version: 1 } },
    });
    const riskProfile =
      existingRiskProfile ??
      (await transaction.riskProfile.create({
        data: {
          id: developmentRiskProfileId,
          organizationId: organization.id,
          siteId: site.id,
          version: 1,
          isActive: true,
          calibrationStatus: 'PROVISIONAL',
          notes: 'Profil provisional development; wajib dikalibrasi sebelum penggunaan lapangan.',
          safeTiltMagnitudeDegLt: 3,
          safeSoilMoisturePctLt: 65,
          safeRainfallMmHourLt: 20,
          dangerTiltMagnitudeDegGt: 8,
          dangerRainfallMmHourGt: 50,
          dangerSoilMoisturePctGt: 85,
          technicalTiltXDegMin: -180,
          technicalTiltXDegMax: 180,
          technicalTiltYDegMin: -180,
          technicalTiltYDegMax: 180,
          technicalTiltMagnitudeMin: 0,
          technicalTiltMagnitudeMax: 180,
          technicalSoilMoistureMin: 0,
          technicalSoilMoistureMax: 100,
          technicalRainfallMin: 0,
          technicalRainfallMax: 1000,
          technicalBatteryVoltageMin: 0,
          technicalBatteryVoltageMax: 30,
          technicalSignalRssiMin: -150,
          technicalSignalRssiMax: 0,
          onlineWithinMinutes: 20,
          offlineAfterMinutes: 35,
          watchConsecutiveSamples: 2,
          dangerConsecutiveSamples: 1,
          downgradeStableMinutes: 10,
          mismatchConsecutiveSamples: 3,
        },
      }));

    const seedUsers: readonly SeedUser[] = [
      {
        email: environment.SEED_PROJECT_OWNER_EMAIL,
        name: environment.SEED_PROJECT_OWNER_NAME,
        password: environment.SEED_PROJECT_OWNER_PASSWORD,
        role: Role.PROJECT_OWNER,
      },
      {
        email: environment.SEED_SCHOOL_ADMIN_EMAIL,
        name: environment.SEED_SCHOOL_ADMIN_NAME,
        password: environment.SEED_SCHOOL_ADMIN_PASSWORD,
        role: Role.SCHOOL_ADMIN,
      },
    ];

    for (const seedUser of seedUsers) {
      const normalizedEmail = normalizeEmail(seedUser.email);
      const existingUser = await transaction.user.findUnique({
        where: { normalizedEmail },
      });

      const user =
        existingUser === null
          ? await transaction.user.create({
              data: {
                email: normalizedEmail,
                isActive: true,
                name: seedUser.name,
                normalizedEmail,
                passwordHash: await argon2.hash(seedUser.password, {
                  type: argon2.argon2id,
                }),
              },
            })
          : await transaction.user.update({
              where: { id: existingUser.id },
              data: {
                email: normalizedEmail,
                isActive: true,
                name: seedUser.name,
                ...((await argon2.verify(existingUser.passwordHash, seedUser.password))
                  ? {}
                  : {
                      passwordHash: await argon2.hash(seedUser.password, {
                        type: argon2.argon2id,
                      }),
                    }),
              },
            });

      await transaction.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
        update: { isActive: true, role: seedUser.role },
        create: {
          isActive: true,
          organizationId: organization.id,
          role: seedUser.role,
          userId: user.id,
        },
      });
    }

    return {
      monitoringPointId: monitoringPoint.id,
      organizationId: organization.id,
      riskProfileId: riskProfile.id,
      siteId: site.id,
    };
  });

  const counts = await prisma.$transaction([
    prisma.organization.count(),
    prisma.site.count(),
    prisma.monitoringPoint.count(),
    prisma.user.count(),
    prisma.membership.count(),
    prisma.riskProfile.count(),
  ]);

  console.info(
    JSON.stringify({
      event: 'development_seed_completed',
      ids: result,
      counts: {
        memberships: counts[4],
        monitoringPoints: counts[2],
        organizations: counts[0],
        riskProfiles: counts[5],
        sites: counts[1],
        users: counts[3],
      },
    }),
  );
}

try {
  await runSeed();
} finally {
  await prisma.$disconnect();
}
