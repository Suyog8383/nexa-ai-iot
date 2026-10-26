# Nexa

AI-powered indoor environment monitoring: an ESP32 + BME280 sensor reports temperature and humidity, and the Nexa mobile app shows readings, trends, alerts and an AI assistant that explains them.

## Repository layout

| Path | What | Status |
| --- | --- | --- |
| [`apps/mobile`](apps/mobile) | React Native + Expo app (Expo Router, TypeScript) | Active — MVP UI on mock data |
| [`apps/api`](apps/api) | Backend API (Fastify + TypeScript, PostgreSQL) | Devices, device tokens, telemetry ingestion, reading history, alert rules and alert events |
| [`packages/contracts`](packages/contracts) | Shared API schemas (zod), types and limits | Active — API contract v1 |
| [`firmware/esp32-bme280`](firmware/esp32-bme280) | ESP32 + BME280 sensor firmware | Planned |
| [`infra`](infra) | Local Postgres (Docker Compose); deployment later | Local dev only |
| [`docs`](docs) | Architecture, decisions and deferred work | [architecture.md](docs/architecture.md), [deferred-work.md](docs/deferred-work.md) |

## Setup

This is an npm workspaces monorepo: install once, from the repository root.

```bash
npm ci             # installs every workspace (one root package-lock.json)
npm test           # all workspaces
npm run typecheck  # all workspaces
npm run lint
```

## Run the mobile app

Requires the Expo Go app (SDK 57) on an Android device.

```bash
cd apps/mobile
npx expo start
```

Scan the QR code with Expo Go. See [`apps/mobile/README.md`](apps/mobile/README.md) for app-specific checks.
