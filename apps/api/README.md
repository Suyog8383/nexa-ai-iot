# Nexa API

Fastify 5 + TypeScript + PostgreSQL 16, as a modular monolith. Request and response schemas come from `@nexa/contracts`. Design decisions are in [docs/architecture.md](../../docs/architecture.md).

**Status:** health check, device registration and device tokens. Telemetry and alerts come in later PRs.

## Endpoints

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/health` | none | 200 `ok` / 503 `degraded` depending on the database |
| `POST /v1/devices` | owner | Register a device. **Returns its device token once.** |
| `GET /v1/devices` | owner | List devices (oldest first) |
| `GET /v1/devices/:id` | owner | One device |
| `POST /v1/devices/:id/token` | owner | Replace the device token (the old one stops working immediately). **Returns the new token once.** |

**Owner auth:** `Authorization: Bearer <OWNER_TOKEN>`. It's checked before the request body is read, and a missing or wrong token gets `401` with `WWW-Authenticate: Bearer`.

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

There's no CORS (the native app doesn't need it) and no rate limiting yet. Rate limiting arrives with telemetry ingestion.

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
