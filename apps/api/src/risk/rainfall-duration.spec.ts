import { describe, expect, it } from 'vitest';

import { summarizeRainfallDuration, type RainfallHistorySample } from './rainfall-duration.js';

const timeZone = 'Asia/Jakarta';

describe('summarizeRainfallDuration', () => {
  it('recognizes three immediately preceding moderate-rain days', () => {
    const samples = [
      ...oneHourOfRain('2026-08-01', 40),
      ...oneHourOfRain('2026-08-02', 35),
      ...oneHourOfRain('2026-08-03', 45),
    ];

    const result = summarizeRainfallDuration({
      samples,
      currentAt: localDate('2026-08-04', 8),
      timeZone,
      moderateDailyMinMm: 30,
      moderateDailyMaxMm: 50,
      requiredPreviousDays: 3,
    });

    expect(result.consecutiveModerateDays).toBe(3);
    expect(result.previousDailyTotalsMm).toEqual([
      expect.closeTo(45, 5),
      expect.closeTo(35, 5),
      expect.closeTo(40, 5),
    ]);
  });

  it('breaks the sequence when one prior day is below the moderate range', () => {
    const samples = [
      ...oneHourOfRain('2026-08-01', 40),
      ...oneHourOfRain('2026-08-02', 20),
      ...oneHourOfRain('2026-08-03', 45),
    ];

    const result = summarizeRainfallDuration({
      samples,
      currentAt: localDate('2026-08-04', 8),
      timeZone,
      moderateDailyMinMm: 30,
      moderateDailyMaxMm: 50,
      requiredPreviousDays: 3,
    });

    expect(result.consecutiveModerateDays).toBe(1);
    expect(result.previousDailyTotalsMm[1]).toBeCloseTo(20, 5);
  });

  it('caps carried rainfall rates at one minute across telemetry gaps', () => {
    const result = summarizeRainfallDuration({
      samples: [
        { timestamp: localDate('2026-08-03', 0), rainfallMmHour: 60 },
        { timestamp: localDate('2026-08-03', 12), rainfallMmHour: 0 },
      ],
      currentAt: localDate('2026-08-04', 8),
      timeZone,
      moderateDailyMinMm: 30,
      moderateDailyMaxMm: 50,
      requiredPreviousDays: 1,
    });

    expect(result.previousDailyTotalsMm[0]).toBeCloseTo(1, 5);
    expect(result.consecutiveModerateDays).toBe(0);
  });
});

function oneHourOfRain(date: string, rainfallMmHour: number): RainfallHistorySample[] {
  return Array.from({ length: 61 }, (_, minute) => ({
    timestamp: new Date(`${date}T00:${String(minute % 60).padStart(2, '0')}:00+07:00`),
    rainfallMmHour,
  })).map((sample, index) =>
    index === 60 ? { timestamp: new Date(`${date}T01:00:00+07:00`), rainfallMmHour: 0 } : sample,
  );
}

function localDate(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`);
}
