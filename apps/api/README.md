# Nexa API

Fastify 5 + TypeScript + PostgreSQL 16, as a modular monolith. Request and response schemas come from `@nexa/contracts`. Design decisions are in [docs/architecture.md](../../docs/architecture.md).

**Status:** skeleton. Only `GET /v1/health` exists, and the database has only the `devices` table. Devices, tokens, telemetry and alerts come in later PRs.

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
| `TEST_DATABASE_URL` | tests only | — | Must point to a database whose name ends in `_test` |
| `HOST` | no | `127.0.0.1` | Set to `0.0.0.0` only to reach the API from a phone on your LAN |
| `PORT` | no | `4000` | |
| `LOG_LEVEL` | no | `info` | `fatal`…`trace`, or `silent` |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |

The API checks these at startup and exits with a message that names the bad variables without printing their values.

## Errors and logging

- **Errors** are `application/problem+json` (RFC 9457), with `type` values like `urn:nexa:problem:validation`. A 422 lists field paths such as `readings.0.humidityPct`. 5xx responses never include internal details; those go to the log.
- **Logs** are JSON (pino). `authorization` and `cookie` headers, and fields named `token`, `deviceToken`, `password`, `databaseUrl` or `connectionString`, are replaced with `[REDACTED]`.
