const maximumRainfallCarryMilliseconds = 60_000;
const millisecondsPerHour = 3_600_000;

export interface RainfallHistorySample {
  readonly timestamp: Date;
  readonly rainfallMmHour: number | null;
}

export interface RainfallDurationSummary {
  readonly consecutiveModerateDays: number;
  readonly previousDailyTotalsMm: readonly number[];
}

export function summarizeRainfallDuration(input: {
  readonly samples: readonly RainfallHistorySample[];
  readonly currentAt: Date;
  readonly timeZone: string;
  readonly moderateDailyMinMm: number;
  readonly moderateDailyMaxMm: number;
  readonly requiredPreviousDays: number;
}): RainfallDurationSummary {
  const dateFormatter = createDateFormatter(input.timeZone);
  const currentDate = localDateParts(input.currentAt, dateFormatter);
  const previousDateKeys = Array.from({ length: input.requiredPreviousDays }, (_, index) =>
    calendarDateKey(currentDate.year, currentDate.month, currentDate.day - index - 1),
  );
  const relevantDates = new Set(previousDateKeys);
  const totals = new Map<string, number>();
  const samples = [...input.samples].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined || sample.rainfallMmHour === null) continue;
    if (!Number.isFinite(sample.rainfallMmHour) || sample.rainfallMmHour < 0) continue;

    const startedAt = sample.timestamp.getTime();
    const nextAt = samples[index + 1]?.timestamp.getTime() ?? input.currentAt.getTime();
    const endedAt = Math.min(
      nextAt,
      startedAt + maximumRainfallCarryMilliseconds,
      input.currentAt.getTime(),
    );
    if (endedAt <= startedAt) continue;
    addInterval(totals, relevantDates, dateFormatter, startedAt, endedAt, sample.rainfallMmHour);
  }

  const previousDailyTotalsMm = previousDateKeys.map((key) => totals.get(key) ?? 0);
  let consecutiveModerateDays = 0;
  for (const total of previousDailyTotalsMm) {
    if (total < input.moderateDailyMinMm || total > input.moderateDailyMaxMm) break;
    consecutiveModerateDays += 1;
  }

  return { consecutiveModerateDays, previousDailyTotalsMm };
}

function addInterval(
  totals: Map<string, number>,
  relevantDates: ReadonlySet<string>,
  formatter: Intl.DateTimeFormat,
  startedAt: number,
  endedAt: number,
  rainfallMmHour: number,
): void {
  let cursor = startedAt;
  while (cursor < endedAt) {
    const key = localDateKey(new Date(cursor), formatter);
    const finalKey = localDateKey(new Date(endedAt - 1), formatter);
    const segmentEnd =
      key === finalKey ? endedAt : firstDifferentLocalDate(cursor, endedAt, key, formatter);
    if (relevantDates.has(key)) {
      const rainfallMm = (rainfallMmHour * (segmentEnd - cursor)) / millisecondsPerHour;
      totals.set(key, (totals.get(key) ?? 0) + rainfallMm);
    }
    cursor = segmentEnd;
  }
}

function firstDifferentLocalDate(
  startedAt: number,
  endedAt: number,
  initialKey: string,
  formatter: Intl.DateTimeFormat,
): number {
  let low = startedAt + 1;
  let high = endedAt;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDateKey(new Date(middle), formatter) === initialKey) low = middle + 1;
    else high = middle;
  }
  return low;
}

function createDateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function localDateParts(date: Date, formatter: Intl.DateTimeFormat) {
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: values.year ?? 0, month: values.month ?? 0, day: values.day ?? 0 };
}

function localDateKey(date: Date, formatter: Intl.DateTimeFormat): string {
  const parts = localDateParts(date, formatter);
  return calendarDateKey(parts.year, parts.month, parts.day);
}

function calendarDateKey(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}
