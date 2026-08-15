-- SAFE remains AMAN, WATCH becomes WASPADA (Tingkat 1), the new WARNING value
-- represents SIAGA (Tingkat 2), and DANGER becomes AWAS (Tingkat 3).
ALTER TYPE "RiskLevel" ADD VALUE IF NOT EXISTS 'WARNING' BEFORE 'DANGER';
