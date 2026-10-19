# @nexa/contracts

The Nexa API contract (v1): zod schemas, inferred TypeScript types, and shared limits. Used by `apps/mobile` today and by `apps/api` from its first PR, so validation is identical on both sides.

| Import | Contains | Dependencies |
| --- | --- | --- |
| `@nexa/contracts` | Request/response schemas and types: devices, telemetry, reading history, alert rules and events, health, problem+json errors | zod |
| `@nexa/contracts/limits` | Plain constants: BME280 ranges, alert threshold bounds and steps, durations, batch and time-window limits, device-token format | none (safe to import in the app without bundling zod) |

## Conventions

- Paths under `/v1`; JSON in camelCase; timestamps ISO 8601 UTC with `Z`; ids are UUIDs.
- Units are part of field names: `temperatureC`, `humidityPct` (Celsius only).
- Request schemas are strict (unknown fields are rejected); response schemas tolerate added fields.
- Errors are RFC 9457 problem details (`Problem`).

The package ships TypeScript source; consumers compile it (Metro in the app, the API's toolchain on the server).

```bash
npm test -w @nexa/contracts       # vitest
npm run typecheck -w @nexa/contracts
```
