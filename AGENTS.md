# VeloMax - Coding Standards & Architecture

## Overview

VeloMax is a vehicle speedometer/HUD app built with Expo SDK 54, React Native 0.81, and NativeWind v4.
It runs exclusively in **landscape right** orientation and is designed for use in vehicles (car/motorcycle) with the phone mounted on the dashboard.

**Target users:** Brazilian drivers (UI in Portuguese, speed limits follow CTB - Codigo de Transito Brasileiro).

## Project Structure

```
velomax/
├── app/
│   ├── _layout.tsx          # Root layout (hides status/nav bars, locks orientation)
│   └── index.tsx            # Main screen orchestrator (~380 lines)
├── components/
│   ├── index.ts             # Barrel file — re-exports all components
│   ├── AddressSearch.tsx     # Address autocomplete (Google Places API)
│   ├── BatteryIndicator.tsx  # Battery level bar + percentage
│   ├── BrightnessControl.tsx # Sun icon + brightness slider
│   ├── Clock.tsx             # HH:MM time display
│   ├── FullScreenMap.tsx     # Full-screen navigation map
│   ├── MiniMap.tsx           # Radar-style mini-map on HUD
│   ├── ScreenshotButton.tsx  # One-tap HUD capture to gallery
│   ├── SpeedArc.tsx          # SVG hockey-stick speed arc with tick marks
│   ├── SpeedLimitButton.tsx  # MAX button with animated flash
│   ├── SpeedLimitModal.tsx   # Speed limit configuration modal
│   ├── Speedometer.tsx       # Large numeric speed display
│   ├── StartupOverlay.tsx    # CRT-style boot animation
│   ├── TripInfo.tsx          # Trip distance + avg speed panel (A/B)
│   └── VehicleSelector.tsx   # Car/motorcycle dropdown selector
├── hooks/
│   ├── index.ts             # Barrel file — re-exports all hooks + types
│   ├── useBattery.ts         # Battery level monitoring
│   ├── useClock.ts           # Time string updater (1s interval)
│   ├── useLocation.ts        # GPS + compass heading fusion
│   ├── usePersistedSettings.ts # AsyncStorage settings management
│   ├── useSpeedLimit.ts      # Auto speed limit detection (Overpass + Geocoding)
│   └── useTrip.ts            # Trip distance + avg speed (Haversine, SQLite-backed)
├── db/
│   ├── index.ts             # Barrel file — re-exports the trip data layer
│   └── trip.ts              # SQLite schema + CRUD for trip counters
├── constants/
│   ├── index.ts             # Barrel file — re-exports all constants
│   ├── env.ts               # GOOGLE_MAPS_KEY (from .env, throws if missing)
│   └── maps.ts              # DARK_MAP_STYLE (re-exports GOOGLE_MAPS_KEY)
├── types/
│   ├── index.ts             # Barrel file — re-exports all types
│   └── navigation.ts        # Destination type (lat/lng/placeId)
├── utils/
│   ├── index.ts             # Barrel file — re-exports all utils
│   └── format.ts            # formatETA, formatDistance
├── assets/
│   └── audios/               # Alert sound files
├── tailwind.config.js        # NativeWind config (colors: neon, panel)
└── app.config.ts             # Expo config (typed, reads the API key from .env)
```

## Configuration & Secrets

- Expo config lives in **`app.config.ts`** (typed `ExpoConfig`), not `app.json`.
- The Google Maps key is read from `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`
  and surfaced through `constants/env.ts`, which throws at import time if it is missing.
- **Never hardcode API keys.** `.env` is gitignored; `.env.example` documents the required keys.
- Note that `EXPO_PUBLIC_*` values are inlined into the bundle at build time, so the key is
  readable inside any APK produced. Restrict the key in the Google Cloud Console and set a
  spend cap before sharing a build. See the README for details.

## Git Conventions

- **Commit messages must be in English**, short, and follow conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.)
- Keep commit messages concise — one short sentence, max two
- Use imperative mood (e.g., "add startup animation", not "added startup animation")

## Coding Standards

### 1. Conditional Rendering

**NEVER use `&&` for conditional JSX rendering.** Always use ternary operators.

This prevents crashes when the left operand evaluates to `0` or `""` (falsy but not `null/undefined`), which would render `0` or an empty string to the screen instead of nothing.

```tsx
// WRONG - can cause crashes
{condition && <Component />}

// CORRECT - always use ternary
{condition ? <Component /> : null}
```

### 2. Styling: Tailwind First

Use NativeWind/Tailwind `className` wherever possible. Only use inline `style={{}}` when:

1. **Animated.View interpolation** - `Animated` requires the `style` prop (e.g., `flashAnim.interpolate()`)
2. **MapView dimensions** - `react-native-maps` MapView doesn't support `className` for sizing
3. **CSS border trick** - The triangle/arrow shape uses border widths (no Tailwind equivalent)
4. **Dynamic percentage widths** - Like battery fill bar (`width: ${level * 100}%`)
5. **Android elevation** - `elevation` prop has no Tailwind equivalent in NativeWind

```tsx
// WRONG - static values as inline style
style={{ width: 200, minWidth: 300, position: "relative" }}

// CORRECT - use Tailwind classes
className="w-[200px] min-w-[300px] relative"
```

### 3. Component Structure

- **One component per file** in `components/`
- **Named exports** for all components and hooks (not default exports, except `app/index.tsx`)
- **Props type** defined at the top of each file as `type Props = { ... }`
- **JSDoc comments** on every exported function explaining purpose and behavior
- **Components are pure UI** - business logic lives in hooks

### 4. Hook Conventions

- Hooks live in `hooks/` directory
- Named `use<Purpose>.ts` (e.g., `useLocation.ts`, `useBattery.ts`)
- Return typed objects, not arrays
- Handle their own cleanup in `useEffect` return functions
- Export any shared types (e.g., `LocationState`)

### 5. Imports & Barrel Files

- **Always import from barrel files** (`@/components`, `@/hooks`, `@/constants`, `@/db`, `@/types`, `@/utils`) — never from individual files
- Each directory (`components/`, `hooks/`, `constants/`, `db/`, `types/`, `utils/`) has an `index.ts` that re-exports all public members
- **No duplicated constants, types, or utilities** — shared code lives in its dedicated module:
  - API key (`GOOGLE_MAPS_KEY`) → `constants/env.ts`
  - Map style (`DARK_MAP_STYLE`) → `constants/maps.ts`
  - Shared types (`Destination`) → `types/navigation.ts`
  - Utility functions (`formatETA`, `formatDistance`) → `utils/format.ts`
  - Persistence helpers (`openTripDb`, `loadTrip`, `saveTrip`, ...) → `db/trip.ts`

```tsx
// WRONG - importing from individual files
import { MiniMap } from "@/components/MiniMap";
import { useLocation } from "@/hooks/useLocation";

// CORRECT - import from barrel
import { MiniMap } from "@/components";
import { useLocation } from "@/hooks";
```

### 6. State Management

- **No global state library** - all state is local via `useState`/`useRef`
- **Settings persistence** via `@react-native-async-storage/async-storage` (theme, brightness, vehicle, speed limit mode), loaded once on mount by `usePersistedSettings`
- **Trip persistence** via `expo-sqlite` (`velomax.db`, table `trip`) through the `db/` layer — counters survive app restarts
- **Refs** for values needed in callbacks without re-renders (e.g., `autoSpeedLimitRef`)

## Architecture

### Data Flow

```
index.tsx (orchestrator)
├── usePersistedSettings() → theme, brightness, vehicle, speedLimitMode
├── useClock() → time string
├── useBattery() → battery level
├── useLocation(mapRef, fullMap) → location, speed, smoothSpeed, heading
├── useSpeedLimit(location, mode, limit) → speedLimit, flashAnim, ...
├── useTrip(location, speed) → activeTrip, tripDistance, avgSpeed, toggle/reset
│
├── StartupOverlay (mounts first, fades out into the HUD)
│
├── HUD Mode:
│   ├── MiniMap ← location, destination, route
│   ├── BatteryIndicator ← batteryLevel
│   ├── Clock ← time
│   ├── SpeedArc ← speed
│   ├── SpeedLimitButton ← speedLimit, speed, flashAnim
│   ├── SpeedLimitModal ← speedLimit, mode
│   ├── BrightnessControl ← brightness
│   ├── ScreenshotButton ← captures hudCaptureRef to the gallery
│   ├── TripInfo ← activeTrip, tripDistance, avgSpeed
│   └── Speedometer ← speed, smoothSpeed, speedLimit
│
└── FullScreen Mode:
    └── FullScreenMap ← location, destination, route
        ├── AddressSearch ← location
        └── VehicleSelector ← vehicleMode
```

### Key Features

| Feature | Component(s) | Hook(s) |
|---------|-------------|---------|
| Speed display | `Speedometer`, `SpeedArc` | `useLocation` |
| Mini-map with route | `MiniMap` | `useLocation` |
| Full navigation | `FullScreenMap`, `AddressSearch`, `VehicleSelector` | `useLocation` |
| Auto speed limit | `SpeedLimitButton`, `SpeedLimitModal` | `useSpeedLimit` |
| Trip computer (A/B) | `TripInfo` | `useTrip` |
| Battery monitoring | `BatteryIndicator` | `useBattery` |
| Brightness control | `BrightnessControl` | `usePersistedSettings` |
| Theme toggle | (long press on HUD) | `usePersistedSettings` |
| Clock | `Clock` | `useClock` |
| HUD screenshot | `ScreenshotButton` | — (`captureRef` + `MediaLibrary` in `index.tsx`) |
| Boot animation | `StartupOverlay` | — |

### External APIs

| API | Purpose | File |
|-----|---------|------|
| Google Maps SDK for Android | Map rendering | `MiniMap.tsx`, `FullScreenMap.tsx` |
| Google Directions | Route overlay + ETA | `MiniMap.tsx`, `FullScreenMap.tsx` (via `MapViewDirections`) |
| Google Places | Address autocomplete + place details | `AddressSearch.tsx` |
| Google Geocoding | Reverse geocode to road name (speed limit fallback) | `useSpeedLimit.ts` |
| Overpass API (OpenStreetMap) | Road tags for speed limit detection — public, no key | `useSpeedLimit.ts` |

All Google calls share `GOOGLE_MAPS_KEY`. Failures surface to the user as toasts
(`react-native-toast-message`); rate-limit toasts are deduplicated so they don't repeat.

### Speed Limit Detection

Hybrid detection, polled every 15 seconds (`setInterval(checkSpeedLimit, 15000)`).
Each result carries a `source` tag so the UI can tell how confident the value is:
`osm | ctb_default | name_fallback | none | error | rate_limit`.

1. Query the Overpass API with the current GPS coordinates to find nearby roads.
   When several roads match, `ROAD_HIERARCHY` picks the highest-priority one
   (motorway > trunk > primary/secondary > tertiary > residential).
2. If the road has a `maxspeed` tag → `source: "osm"`:
   - `none` → no limit
   - `BR:urban` → 60 km/h, `BR:rural` → 100 km/h
   - numeric prefix (e.g. `80 mph`) → parsed integer
3. Otherwise infer from the road type using `BR_SPEED_DEFAULTS` → `source: "ctb_default"`:

   | OSM highway tag | Limit |
   |---|---|
   | `motorway` | 110 km/h |
   | `trunk` | 80 km/h |
   | `motorway_link`, `trunk_link`, `primary`, `secondary` | 60 km/h |
   | `tertiary`, `unclassified` | 40 km/h |
   | `residential`, `living_street` | 30 km/h |

4. If Overpass returns nothing, reverse geocode via Google Geocoding and infer from the
   road name (e.g. `BR-xxx` → 110 km/h) → `source: "name_fallback"`.
5. When the limit **decreases** (entering a more restrictive zone), triggers:
   - Audio alert (with 2-minute cooldown)
   - Visual flash on the MAX button (3x yellow/orange blink)

`isDualCarriageway()` inspects `oneway`, `dual_carriageway` and `lanes` to distinguish
divided highways from single-carriageway roads.

### GPS/Compass Fusion

The `useLocation` hook implements a heading fusion algorithm:

- **Speed > 5 km/h:** Uses GPS heading (more accurate when moving)
- **Speed < 5 km/h:** Uses compass heading (GPS heading unreliable when stationary)
- **Transition:** Smoothed via adaptive `smoothAngle()` function
- **Landscape right compensation:** +90 degrees to align sensor axis with vehicle front

## Dependencies

Key dependencies used across the codebase:

| Package | Purpose |
|---------|---------|
| `nativewind` v4 | Tailwind CSS for React Native |
| `react-native-maps` | Google Maps integration |
| `react-native-maps-directions` | Route overlay on maps |
| `react-native-svg` | Speed arc and trip panel vector graphics |
| `react-native-view-shot` | Capture the HUD as an image |
| `expo-media-library` | Save captured screenshots to the gallery |
| `expo-location` | GPS + compass heading |
| `expo-sqlite` | Trip counter persistence (`velomax.db`) |
| `expo-av` | Audio playback (speed limit alerts) |
| `expo-battery` | Battery level monitoring |
| `expo-brightness` | Screen brightness control |
| `expo-keep-awake` | Prevent screen sleep |
| `expo-navigation-bar` | Hide the Android navigation bar |
| `expo-screen-orientation` | Lock orientation to landscape right |
| `react-native-toast-message` | Error toasts for failed API calls |
| `@react-native-async-storage/async-storage` | Persistent settings |
| `@react-native-community/slider` | Brightness slider |

## File-by-file Reference

### `app/_layout.tsx`
Root layout. Hides the status and navigation bars (`expo-navigation-bar`), locks orientation, and mounts the toast host.

### `app/index.tsx` (~380 lines)
Main screen orchestrator. Composes all hooks and components. Contains no business logic — only state wiring, layout, and the screenshot handler (`captureRef` → `MediaLibrary.saveToLibraryAsync`).

### `hooks/useLocation.ts`
GPS tracking with compass heading fusion. Exports `LocationState` type. Handles `watchPositionAsync` and `watchHeadingAsync` with smooth angle interpolation, a speed dead zone, and adaptive smoothing.

### `hooks/useSpeedLimit.ts`
Auto speed limit detection via Overpass API with a Google Geocoding fallback. Contains `extractSpeedLimit()`, `isDualCarriageway()`, alert sound management, and 15-second polling. Exports the flash animation value for the MAX button.

### `hooks/useTrip.ts`
Trip computer. Accumulates distance with the Haversine formula and computes average speed from moving time. Keeps two independent distance accumulators (A/B) plus a separate accumulator for the average, all persisted through `db/`. Exports the `TripState` type.

### `db/trip.ts`
SQLite data layer for the `trip` table. `openTripDb()` creates the schema and retries with backoff to work around an Android `NullPointerException` where the native database isn't ready right after `openDatabaseAsync`. Exposes `loadTrip`, `saveTrip`, and the reset helpers.

### `constants/env.ts`
Reads `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and throws at import time if it is missing, so misconfiguration fails loudly instead of producing silent API errors.

### `hooks/usePersistedSettings.ts`
Loads and persists all user settings from AsyncStorage: theme, brightness, vehicle mode, speed limit mode. Provides setter functions that automatically persist changes.

### `hooks/useBattery.ts`
Monitors battery level via `expo-battery`. Returns a number between 0-1 or null.

### `hooks/useClock.ts`
Updates a "HH:MM" string every second. Pure utility hook.

### `components/MiniMap.tsx`
Radar-style mini-map on the HUD. Shows current position with vehicle arrow, route overlay, and ETA/distance info. Tapping opens full-screen map.

### `components/FullScreenMap.tsx`
Full-screen interactive map with navigation controls. Contains `AddressSearch` and `VehicleSelector` as children. Handles tap-to-set-destination, route display, and map controls.

### `components/SpeedLimitButton.tsx`
Animated MAX button showing current speed limit. Uses `Animated.View` with interpolated colors (inline styles required by Animated API).

### `components/SpeedLimitModal.tsx`
Modal for setting speed limit: automatic mode (Overpass API), manual presets (30-120 km/h), or disable. Persists choices to AsyncStorage.

### `components/AddressSearch.tsx`
Text input with debounced Google Places Autocomplete. Shows results in a scrollable list. Self-contained state for search query and results.

### `components/VehicleSelector.tsx`
Dropdown selector for car/motorcycle mode. Uses absolute positioning for the dropdown menu.

### `components/BatteryIndicator.tsx`
Visual battery indicator with colored fill bar (blue/orange/red based on level).

### `components/BrightnessControl.tsx`
Sun icon toggle with slider for screen brightness control.

### `components/Clock.tsx`
Simple time display component.

### `components/Speedometer.tsx`
Large numeric speed display with pulse animation when exceeding the speed limit.

### `components/SpeedArc.tsx`
SVG speed arc in a "hockey stick" shape (wide flat base, thick vertical body, tapering ~90° bend at the top). Draws tick marks and numbers at the speeds in `TICK_SPEEDS`. Pure presentational — takes `speed` and renders.

### `components/TripInfo.tsx`
Trip panel below the speedometer, with an SVG decorative S-curve. Shows the active trip (A/B), distance and average speed, and exposes toggle/reset actions. Formats distance as `123 m` below 1 km and `12.3 km` above.

### `components/StartupOverlay.tsx`
CRT-style boot animation: a horizontal line energizes at the center, expands vertically, then fades out to reveal the HUD. Uses only React Native `Animated` (inline styles are required by the `Animated` API).

### `components/ScreenshotButton.tsx`
One-tap button that triggers the HUD capture handler in `index.tsx`.
