ALTER TABLE "RiskProfile"
ADD COLUMN "moderateRainfallDailyMinMm" DECIMAL(10,4) NOT NULL DEFAULT 30,
ADD COLUMN "moderateRainfallDailyMaxMm" DECIMAL(10,4) NOT NULL DEFAULT 50,
ADD COLUMN "moderateRainfallConsecutiveDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "rainfallContinuationMmHourGt" DECIMAL(65,20) NOT NULL DEFAULT 0;

ALTER TABLE "RiskProfile"
ADD CONSTRAINT "RiskProfile_moderate_rainfall_daily_range_check"
CHECK (
  "moderateRainfallDailyMinMm" >= 0
  AND "moderateRainfallDailyMaxMm" > "moderateRainfallDailyMinMm"
  AND "moderateRainfallConsecutiveDays" BETWEEN 1 AND 30
  AND "rainfallContinuationMmHourGt" >= 0
);
