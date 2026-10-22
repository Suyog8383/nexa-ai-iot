# Nexa API

Fastify 5 + TypeScript + PostgreSQL 16, as a modular monolith. Request and response schemas come from `@nexa/contracts`. Design decisions are in [docs/architecture.md](../../docs/architecture.md).

**Status:** health check, device registration and tokens, telemetry ingestion, latest readings and history. Alerts come in a later PR.

## Endpoints

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/health` | none | 200 `ok` / 503 `degraded` depending on the database |
| `POST /v1/devices` | owner | Register a device. **Returns its device token once.** |
| `GET /v1/devices` | owner | List devices (oldest first) |
| `GET /v1/devices/:id` | owner | One device |
| `POST /v1/devices/:id/token` | owner | Replace the device token (the old one stops working immediately). **Returns the new token once.** |
| `POST /v1/telemetry` | device | Send a batch of readings (and optional diagnostics) |
| `GET /v1/devices/:id/readings` | owner | Reading history: raw, 5-minute or hourly |

**Owner auth:** `Authorization: Bearer <OWNER_TOKEN>`. **Device auth:** `Authorization: Bearer <device token>`. Neither works in place of the other. Both are checked before the request body is read, and a missing or wrong token gets `401` with `WWW-Authenticate: Bearer`.

**Device tokens:**
- Format `nxd_<device id>.<43 base64url chars>`: 256 random bits from `crypto.randomBytes`.
- Only the SHA-256 hash is stored; comparison is constant-time.
- Responses that carry a token are sent with `Cache-Control: no-store`.
- List and detail responses never include tokens or hashes.

**Device status** is derived on the server from `last_seen_at`, and clients can't set it:
- `never_seen`: no telemetry yet
- `online`: last seen within 3 × the device's reporting interval (90 s at the default 30 s; the multiplier is `ONLINE_INTERVALS` in `@nexa/contracts/limits`)
- `offline`: otherwise

```bash
OWNER=$(sed -n 's/^OWNER_TOKEN=//p' apps/api/.env)
curl -s -X POST http://127.0.0.1:4000/v1/devices -H "Authorization: Bearer $OWNER" \
  -H 'content-type: application/json' \
  -d '{"name":"Living Room Monitor","room":"Living Room","board":"ESP32","sensor":"BME280"}'
curl -s http://127.0.0.1:4000/v1/devices -H "Authorization: Bearer $OWNER"
```

There's no CORS (the native app doesn't need it).

## Telemetry

`POST /v1/telemetry` with the device token. The device id always comes from the token; a `deviceId` anywhere in the body is rejected (`422`).

```json
{
  "readings": [{ "recordedAt": "2026-10-21T08:30:00.000Z", "temperatureC": 21.5, "humidityPct": 45 }],
  "diagnostics": { "rssiDbm": -62, "firmwareVersion": "0.1.0", "uptimeS": 3600 }
}
```

- **Batch:** 1–100 readings. One invalid reading rejects the whole batch (`422`, with paths like `readings.3.recordedAt`); nothing is stored.
- **Values** (BME280 operating range): `temperatureC` −40…85, `humidityPct` 0…100, both JSON numbers.
- **`recordedAt`:** UTC ISO 8601 with `Z`, stored to the millisecond. It may be at most 2 minutes ahead of the server's receive time and at most 24 hours behind it. If omitted, the receive time is used, so at most one reading per batch may omit it.
- **Diagnostics** (all optional): `rssiDbm` integer −120…0, `firmwareVersion` 1–32 printable ASCII characters, `uptimeS` integer 0…2147483647. Fields left out keep their previous values.
- **Response `202`:** `{"accepted":n,"duplicates":n,"conflicts":n}`.
  - Resending a reading is safe: the same `recordedAt` with the same values counts as a duplicate.
  - A stored reading is never overwritten. The same `recordedAt` with different values counts as a conflict, isn't stored, and is logged as a warning.
- **Every authenticated, valid report** sets `last_seen_at` (so the device shows `online`), even one made only of duplicates. The update and the inserts happen in one transaction, and are skipped (`401`) if the token was replaced or revoked meanwhile.
- **Rate limit:** 30 requests per device per minute (`TELEMETRY_RATE_LIMIT` in `@nexa/contracts/limits`). Responses carry `x-ratelimit-limit`/`-remaining`/`-reset`; over the limit returns `429` with `retry-after` (seconds). The limit is keyed on the device the token belongs to, so invalid requests count against the sender and requests without a valid token count against no device. Counters live in the API process's memory, which is fine for a single local instance.

`GET /v1/devices` and `GET /v1/devices/:id` include each device's `latestReading` (the one with the newest `recordedAt`), or `null` if it has none.

## Reading history

`GET /v1/devices/:id/readings?from=&to=&bucket=&limit=&cursor=` (owner token).

| Parameter | Default | Notes |
| --- | --- | --- |
| `from`, `to` | `to` = now, `from` = `to` − 24 h | UTC ISO 8601. Half-open range: `from` ≤ `recordedAt` < `to`. At most 31 days |
| `bucket` | `raw` | `raw`, `5m` or `1h` |
| `limit` | 100 | 1–500 items per page |
| `cursor` | — | `nextCursor` from the previous page |

- **Order:** newest first. `nextCursor` is `null` on the last page. Keep `from`/`to` the same while paging, and use a cursor only with the `bucket` it came from.
- **`raw`** items are readings: `{recordedAt, receivedAt, temperatureC, humidityPct}`.
- **`5m` / `1h`** items are `{bucketStart, temperatureC: {min, avg, max}, humidityPct: {min, avg, max}, count}`.
  - Buckets are aligned to UTC (for example 10:00, 10:05; or 10:00, 11:00).
  - **Empty periods are omitted**, not returned as zero-count buckets; gaps show up as jumps in `bucketStart`.
  - **Partial buckets:** only readings inside the range are aggregated. A bucket that straddles `from` or `to` covers just the part inside it, and its `bucketStart` can be earlier than `from`. `count` says how many readings it holds.

```bash
OWNER=$(sed -n 's/^OWNER_TOKEN=//p' apps/api/.env)
DEVICE_TOKEN='nxd_...'          # from the register (or token) response; shown only once
ID='...'                        # the device id

# Send a reading as the device (no recordedAt: the server stamps it)
curl -s -X POST http://127.0.0.1:4000/v1/telemetry -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"readings":[{"temperatureC":21.5,"humidityPct":45}],"diagnostics":{"rssiDbm":-62,"firmwareVersion":"0.1.0"}}'

# Latest reading and status
curl -s http://127.0.0.1:4000/v1/devices/$ID -H "Authorization: Bearer $OWNER"

# History: raw (last 24 h), then 5-minute buckets for a given range
curl -s "http://127.0.0.1:4000/v1/devices/$ID/readings" -H "Authorization: Bearer $OWNER"
curl -s "http://127.0.0.1:4000/v1/devices/$ID/readings?bucket=5m&from=2026-10-21T00:00:00.000Z&to=2026-10-21T12:00:00.000Z" \
  -H "Authorization: Bearer $OWNER"
```

## Setup (once)

Needs Docker Desktop running. Install dependencies from the repository root (`npm ci`).

```bash
cp infra/.env.example infra/.env           # choose a POSTGRES_PASSWORD
cp apps/api/.env.example apps/api/.env     # use the same password in both URLs
```

Both `.env` files are gitignored. Never commit them.

## Everyday commands (from the repo root)

```bash
npm run db:up -w @nexa/api               # start dev (port 5434) and test (port 5433) Postgres
npm run db:migrate -w @nexa/api          # apply migrations to the dev database
npm run dev -w @nexa/api                 # API on http://127.0.0.1:4000, reloads on change
curl http://127.0.0.1:4000/v1/health     # {"status":"ok","db":"ok","version":"0.1.0"}
npm run db:down -w @nexa/api             # stop containers (dev data is kept in a Docker volume)
```

## Tests

```bash
npm test -w @nexa/api                    # unit + integration
npm run test:unit -w @nexa/api           # no database needed
npm run test:integration -w @nexa/api    # needs the test database (npm run db:up)
```

- **Integration tests fail instead of skipping** when the test database is unreachable.
- **They only use `TEST_DATABASE_URL`.** They refuse any database whose name doesn't end in `_test`, or that matches `DATABASE_URL`.
- **They never delete or drop anything.** Migrations are applied before each run, and tests write data only inside transactions that are rolled back.
- **The test database is in memory** (tmpfs), so it starts empty whenever its container starts. To get a clean one, recreate that container yourself; the agent doesn't do this.

## Schema changes

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate -w @nexa/api` (no database needed) and review the SQL it writes to `src/db/migrations/`.
3. Commit the schema change and the migration together. Never edit a migration that has already been applied.

Drizzle migrations only go forward; there are no generated down migrations. To undo one locally, a human writes and runs the reverse SQL against the dev database (the agent doesn't run destructive SQL).

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | `postgres://` URL of the dev (or deployed) database |
| `OWNER_TOKEN` | yes | — | At least 32 characters. **Development only:** the API refuses to start with `NODE_ENV=production` until real user accounts exist |
| `TEST_DATABASE_URL` | tests only | — | Must point to a database whose name ends in `_test` |
| `HOST` | no | `127.0.0.1` | Set to `0.0.0.0` only to reach the API from a phone on your LAN |
| `PORT` | no | `4000` | |
| `LOG_LEVEL` | no | `info` | `fatal`…`trace`, or `silent` |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |

The API checks these at startup and exits with a message that names the bad variables without printing their values.

## Errors and logging

- **Errors** are `application/problem+json` (RFC 9457), with `type` values like `urn:nexa:problem:validation`. A 422 lists field paths such as `readings.0.humidityPct`. 5xx responses never include internal details; those go to the log.
- **Logs** are JSON (pino). Request headers aren't logged, and `authorization`/`cookie` headers and fields named `token`, `deviceToken`, `password`, `databaseUrl` or `connectionString` are replaced with `[REDACTED]` if anything ever tries to log them.
