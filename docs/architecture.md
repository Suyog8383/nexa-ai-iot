# Nexa architecture

Status as of 2026-10-19. Only `apps/mobile` exists; everything else is planned.

## System overview

```text
ESP32 + BME280  ──telemetry──▶  apps/api (Node.js + TS)  ──▶  PostgreSQL
                                     ▲        │
                         REST/JSON   │        └──▶  AI provider (TBD)
                                     │
                               apps/mobile (Expo)
```

Shared request/response types live in `packages/contracts` and are used by both the app and the API.

## Mobile app (`apps/mobile`) — active

- **Stack:** Expo SDK 57, React Native 0.86, TypeScript (strict), Expo Router, React Compiler.
- **SDK pin:** SDK 57 matches the Expo Go build on the Play Store. Do not upgrade without checking Expo Go availability or moving to development builds.
- **Navigation:** a root stack containing four tabs (Home, Devices, AI Assistant, Alerts), plus Device Details and Create Alert Rule pushed over the tab bar.
- **Design source:** the approved Google Stitch project. Where the dark and light designs disagree on text, the dark copy wins. Screens not designed in Stitch (Pair Device, Notifications, Profile) are placeholders.
- **Theme:** colour tokens from Stitch for both themes, with a shared type and shape scale. The app follows the system theme, with an in-app override.
- **Client state:** Zustand stores in `src/stores/`, persisted to AsyncStorage under versioned keys (`nexa.alerts`, `nexa.preferences`). Stored data is validated on load: invalid entries are dropped, and unreadable data falls back to defaults. Actions are ignored until loading finishes. If storage can't be read, the app keeps working in memory and never overwrites what's stored. The splash screen stays up until the stores are loaded.
- **Data:** mock data only, read through hooks in `src/hooks/`. Hooks return `{ data, isLoading, error }`, matching TanStack Query's result, so each can become a `useQuery` without its screens changing. A lint rule stops screens and components from importing `src/mocks/` directly. Domain types and rule logic live in `src/domain/`. The AI assistant sits behind a service interface (`src/services/assistant.ts`) and returns canned replies.

## Decisions

| Decision | Choice |
| --- | --- |
| Shared client state | Zustand (`src/stores/`) |
| Local persistence | AsyncStorage for alert rules and preferences |
| Server state | TanStack Query, introduced with the API |
| Units | Celsius only for the MVP |
| Platform priority | Android first; keep iOS compatible |
| Monorepo tooling | npm workspaces, added when `apps/api` starts (see below) |

## Monorepo plan

Today `apps/mobile` is a standalone npm project with its own `package-lock.json`. When the API work starts:

1. Add a root `package.json` with `"workspaces": ["apps/*", "packages/*"]` and a single root lockfile.
2. Create `packages/contracts` as `@nexa/contracts` and depend on it from both apps.
3. Keep exactly one version of `react` and `react-native` in the repo. Expo's Metro config detects workspaces automatically from SDK 52 onward, so no custom `metro.config.js` is needed.

The firmware is built with its own toolchain and stays outside the npm workspaces.

## Open questions

- API framework, hosting and authentication.
- Device-to-API transport (HTTP or MQTT), reporting interval, and device provisioning/pairing.
- Telemetry storage and retention in PostgreSQL (plain tables or a time-series extension).
- AI provider and what sensor context the assistant receives.
- Push notification delivery (Expo push service vs FCM directly). This needs EAS development builds.
