# Nexa mobile

React Native app built with Expo SDK 57, Expo Router and TypeScript. The UI implements the approved Google Stitch designs (light and dark themes).

## Run

```bash
npm ci
npx expo start          # scan the QR code with Expo Go (SDK 57)
npx expo start --clear  # after dependency or config changes
```

## Checks

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # lint
npm test           # unit tests (jest-expo)
npx expo-doctor    # dependency and config health
```

## Structure

```text
src/
  app/         routes (Expo Router): (tabs)/ home, devices, assistant, alerts; device/[id]; alert-rule
  components/  reusable UI: ui/, layout/, feedback/ (empty/loading/error), telemetry/, alerts/, assistant/
  domain/      types and deterministic alert-rule logic + validation (no React, no I/O)
  hooks/       the only way screens read data: useDevices, useTelemetry, useAlertHistory, useAssistantIntro
  stores/      Zustand stores persisted to AsyncStorage: alert rules, preferences (theme)
  services/    assistant service (canned replies until a real AI backend exists)
  mocks/       sample data behind the hooks; screens and components can't import it (lint rule)
  theme/       design tokens from Stitch + useTheme (system theme with in-app override)
```

Data hooks return `{ data, isLoading, error }` (TanStack Query's field names). They're backed by `mocks/` today; switching one to a real query changes only the hook.

All sensor values are mock data until the ESP32 firmware and API exist.
