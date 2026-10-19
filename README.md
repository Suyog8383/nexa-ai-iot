# Nexa

AI-powered indoor environment monitoring: an ESP32 + BME280 sensor reports temperature and humidity, and the Nexa mobile app shows readings, trends, alerts and an AI assistant that explains them.

## Repository layout

| Path | What | Status |
| --- | --- | --- |
| [`apps/mobile`](apps/mobile) | React Native + Expo app (Expo Router, TypeScript) | Active — MVP UI on mock data |
| [`apps/api`](apps/api) | Backend API (Node.js + TypeScript, PostgreSQL) | Planned |
| [`packages/contracts`](packages/contracts) | Shared API types and schemas | Planned |
| [`firmware/esp32-bme280`](firmware/esp32-bme280) | ESP32 + BME280 sensor firmware | Planned |
| [`infra`](infra) | Deployment configuration | Planned |
| [`docs`](docs) | Architecture and decisions | [architecture.md](docs/architecture.md) |

## Run the mobile app

Requires Node.js and the Expo Go app (SDK 57) on an Android device.

```bash
cd apps/mobile
npm ci
npx expo start
```

Scan the QR code with Expo Go. See [`apps/mobile/README.md`](apps/mobile/README.md) for checks and scripts.
