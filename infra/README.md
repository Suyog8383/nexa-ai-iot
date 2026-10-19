# Infrastructure

`docker-compose.yml` runs **local development databases only**. Nothing here is deployed.

| Service | Port | Database | Storage |
| --- | --- | --- | --- |
| `postgres` | 127.0.0.1:5434 | `nexa` | Docker volume `nexa_nexa-pg-data` (survives restarts) |
| `postgres-test` | 127.0.0.1:5433 | `nexa_test` | In memory (empty on every container start) |

Both listen on localhost only, and the password comes from `infra/.env` (copy it from `.env.example`; it's gitignored). Port 5434 avoids clashing with other Postgres servers that already use 5432.

Start and stop the databases with `npm run db:up -w @nexa/api` and `npm run db:down -w @nexa/api` (see [apps/api/README.md](../apps/api/README.md)).
