# R10 G4 Browser/UAT Evidence

## 1. Run context

- Tested SHA: `e78cb60f204a6bae416e59226da2a942b0e40864`
- Browser: Playwright Chromium (configured Desktop Chrome)
- Isolated browser environment: PostgreSQL 16 in disposable database `r10g4`
  on port 55434, Redis on port 6381, API on port 3001, web on port 3300.
- The isolated database was migrated from the repository migrations and seeded
  with the normal development fixture. No physical-device database was used.

## 2. Automated browser acceptance

Command:

```text
corepack pnpm --filter @siagalongsor/web test:e2e
```

Result: 7 tests passed, 0 failed, 0 skipped in 13.6 seconds. The suite covered
authentication/session behavior, protected-route redirects, diagnostics-only
Perangkat, and the four-page navigation/current-scope acceptance. A temporary
390x844 mobile smoke (one test) also passed and was removed after the run; it
checked all four routes for usable main content and no horizontal overflow.

## 3. Four-page UAT checklist

| Check                                                                         | Result | Evidence                                                     |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| Login, session reload, logout, protected-route behavior                       | PASS   | `apps/web/e2e/auth.smoke.spec.ts`                            |
| Primary navigation is exactly Overview, Perangkat, Profil Risiko, Audit Log   | PASS   | `apps/web/e2e/r8-final.acceptance.spec.ts`                   |
| Overview route, authoritative empty/unknown-safe presentation, range controls | PASS   | `r8-final.acceptance.spec.ts`; single-device component tests |
| Perangkat connectivity/diagnostics surface and no lifecycle controls          | PASS   | `apps/web/e2e/devices.smoke.spec.ts`                         |
| Profil Risiko route and explicit unavailable state in zero-device fixture     | PASS   | `r8-final.acceptance.spec.ts`                                |
| Audit Log route and explicit empty/unavailable state                          | PASS   | `r8-final.acceptance.spec.ts`                                |
| Null readings remain unavailable and chart segments preserve gaps             | PASS   | `apps/web/src/single-device/single-device.spec.ts`           |
| Responsive desktop/mobile smoke and no horizontal overflow                    | PASS   | Desktop Chromium suite plus temporary 390x844 smoke          |
| Obsolete navigation/CRUD is not required                                      | PASS   | Navigation and Perangkat assertions above                    |

The isolated seeded fixture has no deployed device, so the browser acceptance
validates the configured/zero-device states rather than fabricating telemetry,
thresholds, or calibration values.

## 4. Live physical read-only observations

The physical development deployment was not used by the browser suite and was
not mutated. The previously completed G2 read-only smoke remains the source of
these observations: Overview and Perangkat resolve the enabled physical device;
the device is online, rainfall is readable, uncalibrated tilt and soil are
shown unavailable/unreadable, and the authoritative risk is UNKNOWN. No risk
profile update, credential operation, or device lifecycle mutation was made.

## 5. Limitations

- This pass did not perform synthetic risk-transition mutation, physical smoke,
  performance, or release-decision work; those are G5/G6/G7 gates.
- Browser assertions intentionally avoid claiming soil/IMU calibration or
  scientific threshold validity.
- The configured browser suite is Chromium-only; the mobile check used the
  same Chromium engine at a mobile-sized viewport.

## 6. Conclusion

G4 Browser/UAT acceptance **PASS**. The final four-page product, authentication
and navigation contract, diagnostics-only device surface, null/UNKNOWN safety
presentation, and basic responsive usability passed in an isolated environment.
The physical development database was **not mutated**.
