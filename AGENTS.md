# VeloMax - Coding Standards & Architecture

## Overview

VeloMax is a vehicle speedometer/HUD app built with Expo SDK 54, React Native 0.81, and NativeWind v4.
It runs exclusively in **landscape right** orientation and is designed for use in vehicles (car/motorcycle) with the phone mounted on the dashboard.

**Target users:** Brazilian drivers (UI in Portuguese, speed limits follow CTB - Codigo de Transito Brasileiro).

## Project Structure

```
velomax/
├── app/
│   ├── _layout.tsx          # Root layout (hides status/nav bars)
│   └── index.tsx            # Main screen orchestrator (~196 lines)
├── components/
│   ├── AddressSearch.tsx     # Address autocomplete (Google Places API)
│   ├── BatteryIndicator.tsx  # Battery level bar + percentage
│   ├── BrightnessControl.tsx # Sun icon + brightness slider
│   ├── Clock.tsx             # HH:MM time display
│   ├── FullScreenMap.tsx     # Full-screen navigation map
│   ├── MiniMap.tsx           # Radar-style mini-map on HUD
│   ├── SpeedLimitButton.tsx  # MAX button with animated flash
│   ├── SpeedLimitModal.tsx   # Speed limit configuration modal
│   ├── Speedometer.tsx       # Large numeric speed display
│   └── VehicleSelector.tsx   # Car/motorcycle dropdown selector
├── hooks/
│   ├── useBattery.ts         # Battery level monitoring
│   ├── useClock.ts           # Time string updater (1s interval)
│   ├── useLocation.ts        # GPS + compass heading fusion
│   ├── usePersistedSettings.ts # AsyncStorage settings management
│   └── useSpeedLimit.ts      # Auto speed limit detection (Overpass API)
├── assets/
│   └── audios/               # Alert sound files
├── tailwind.config.js        # NativeWind config (colors: neon, panel)
└── app.json                  # Expo config (landscape orientation)
```

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

### 5. State Management

- **No global state library** - all state is local via `useState`/`useRef`
- **Persistence** via `@react-native-async-storage/async-storage`
- **Settings** are loaded once on mount via `usePersistedSettings` hook
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
│
├── HUD Mode:
│   ├── MiniMap ← location, destination, route
│   ├── BatteryIndicator ← batteryLevel
│   ├── Clock ← time
│   ├── SpeedLimitButton ← speedLimit, speed, flashAnim
│   ├── SpeedLimitModal ← speedLimit, mode
│   ├── BrightnessControl ← brightness
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
| Speed display | `Speedometer` | `useLocation` |
| Mini-map with route | `MiniMap` | `useLocation` |
| Full navigation | `FullScreenMap`, `AddressSearch`, `VehicleSelector` | `useLocation` |
| Auto speed limit | `SpeedLimitButton`, `SpeedLimitModal` | `useSpeedLimit` |
| Battery monitoring | `BatteryIndicator` | `useBattery` |
| Brightness control | `BrightnessControl` | `usePersistedSettings` |
| Theme toggle | (long press on HUD) | `usePersistedSettings` |
| Clock | `Clock` | `useClock` |

### External APIs

| API | Purpose | File |
|-----|---------|------|
| Google Maps (Maps SDK) | Map rendering, directions | `MiniMap.tsx`, `FullScreenMap.tsx` |
| Google Places Autocomplete | Address search | `AddressSearch.tsx` |
| Overpass API (OpenStreetMap) | Speed limit detection | `useSpeedLimit.ts` |

### Speed Limit Detection

The auto speed limit system queries the Overpass API every 15 seconds:

1. Sends GPS coordinates to find the nearest road
2. If the road has a `maxspeed` tag, uses that value
3. If not, falls back to Brazilian CTB defaults by road type:
   - Motorway: 110 km/h
   - Trunk: 100 km/h
   - Primary/Secondary: 60 km/h
   - Tertiary/Residential: 40 km/h
   - Living street: 20 km/h
4. When the limit **decreases** (entering a more restrictive zone), triggers:
   - Audio alert (with 2-minute cooldown)
   - Visual flash on the MAX button (3x yellow/orange blink)

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
| `expo-location` | GPS + compass heading |
| `expo-av` | Audio playback (speed limit alerts) |
| `expo-battery` | Battery level monitoring |
| `expo-brightness` | Screen brightness control |
| `expo-keep-awake` | Prevent screen sleep |
| `@react-native-async-storage/async-storage` | Persistent settings |
| `@react-native-community/slider` | Brightness slider |

## File-by-file Reference

### `app/index.tsx` (196 lines)
Main screen orchestrator. Composes all hooks and components. Contains no business logic — only state wiring and layout.

### `hooks/useLocation.ts`
GPS tracking with compass heading fusion. Exports `LocationState` type. Handles `watchPositionAsync` and `watchHeadingAsync` with smooth angle interpolation.

### `hooks/useSpeedLimit.ts`
Auto speed limit detection via Overpass API. Contains `fetchRoadSpeedLimit()` helper, alert sound management, and 15-second polling logic. Exports flash animation value for the MAX button.

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
