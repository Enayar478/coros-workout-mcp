# Training-plan, calendar, and custom-exercise discovery

Research date: 2026-08-10. No authenticated write request was sent during this
research or implementation.

## Authentication finding

The existing MCP uses consumer Training Hub hosts (`teamapi.coros.com` for US
and `teameuapi.coros.com` for EU) with `accesstoken` and `yfheader.userId`.
The public Training Hub client uses the same host family and headers.

The documented COROS partner API endpoint `POST
https://open.coros.com/coros/tp/list/push` is a different integration. Its
published request requires a partner `token`, a COROS `openId`, and partner
schedule data. It is for a platform with an authorized linked user; it cannot
be called with the stored Training Hub token. Confidence: high, based on the
partner API reference and its required fields.

## Confirmed consumer endpoints

The following were found in the currently deployed public Training Hub bundle
and its training store. They are private, reverse-engineered endpoints, so all
confidence classifications include an instability warning.

| Endpoint | Method | Request shape used here | Source / confidence |
|---|---|---|---|
| `/training/plan/query` | POST | body `{ statusList: number[] }` | Deployed Training Hub `fetchPlanList`; high. |
| `/training/plan/detail` | GET | query `id`, `supportRestExercise=1` | Deployed `fetchPlanDetail`; high. |
| `/training/plan/add` | POST | name, overview, entities, full programs, week stages, version objects and display metadata | Deployed plan-add UI; high for endpoint/method, medium for long-lived payload compatibility. |
| `/training/program/detail` | GET | query `id`, `supportRestExercise=1` | Deployed `fetchProgramDetail`; high. |
| `/training/schedule/query` | GET | query `startDate`, `endDate` in `YYYYMMDD`, `supportRestExercise=1` | Deployed `fetchTraningScheduleList`; high. |
| `/training/schedule/update` | POST | entities, full programs, versionObjects, `pbVersion=2` | Deployed calendar add/move/delete UI; high for endpoint/method, medium for future payload compatibility. |
| `/training/exercise/add` | POST | Standard Strength custom-exercise object | Deployed custom Strength form; high. |
| `/training/exercise/query` | GET | `sportType=4` | Existing MCP and deployed client; high. |

The Training Hub shell reports region ID `3` for EU and `1` for US; those
values are used only in the plan-add payload. Confidence: high from each
public shell’s initial state.

## Risks and design safeguards

- These consumer endpoints are undocumented and may change. They are isolated
  in `src/coros-api.ts` under `TRAINING_HUB_PRIVATE_ENDPOINTS`.
- All added writes are dry-run by default. No live write verification has been
  performed.
- Calendar writes first read the selected date. Adding to a non-empty date is
  rejected unless explicitly allowed; removal needs an exact `idInPlan` and a
  second explicit confirmation for a live request.
- Dry-run output contains only the endpoint and JSON payload. It never contains
  tokens, passwords, cookies, or request headers.
- Plan/calendar reads and workout-detail reads return only the fields necessary
  for tool use, not raw account responses.

## Capability decision

Training plans, calendar reads/writes, and Standard Strength custom exercise
creation have static-client evidence sufficient for guarded private-API support.
Custom Hybrid Fitness / Functional Training creation does not: product help
says it exists, but no compatible Training Hub request/payload was verified.
It remains unsupported in code.
