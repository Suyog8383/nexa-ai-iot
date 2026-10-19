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
  components/  reusable UI: ui/, layout/, telemetry/, alerts/, assistant/
  theme/       design tokens from Stitch + useTheme (system theme with in-app override)
  stores/      Zustand stores persisted to AsyncStorage: alert rules, preferences (theme)
  data/        domain types, alert-rule logic and validation, mock data
  services/    assistant service (canned replies until a real AI backend exists)
```

All sensor values are mock data until the ESP32 firmware and API exist.
