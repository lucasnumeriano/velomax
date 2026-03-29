# Trip A + Velocidade Media

## Resumo

Adicionar Trip A (distancia percorrida) e velocidade media ao HUD, posicionados abaixo do velocimetro com uma linha separadora. Cada metrica tem um botao de reset individual. Dados persistidos em `expo-sqlite`.

## Arquitetura

### Novos arquivos

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| `db/trip.ts` | Camada de dados | Abre banco SQLite, cria tabela, expoe CRUD |
| `hooks/useTrip.ts` | Hook | Acumula distancia, calcula vel. media, persiste |
| `components/TripInfo.tsx` | Componente | Exibe Trip A, vel. media, linha, botoes reset |

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `app/index.tsx` | Importa `useTrip` e `TripInfo`, passa props |
| `components/index.ts` | Re-exporta `TripInfo` |
| `hooks/index.ts` | Re-exporta `useTrip` |

### Dependencia nova

- `expo-sqlite` — banco local SQLite via Expo SDK

## Banco de dados

### Tabela `trip`

```sql
CREATE TABLE IF NOT EXISTS trip (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  distance_m REAL DEFAULT 0,
  moving_time_s REAL DEFAULT 0,
  last_lat REAL,
  last_lng REAL,
  last_timestamp INTEGER
);
```

Uma unica linha (id=1). Reset = `UPDATE trip SET distance_m=0, moving_time_s=0, last_lat=NULL, last_lng=NULL, last_timestamp=NULL WHERE id=1`.

### `db/trip.ts`

Funcoes exportadas:

- `openTripDb()` — abre/cria o banco e a tabela, retorna instancia
- `loadTrip(db)` — retorna `{ distance_m, moving_time_s }`
- `saveTrip(db, data)` — atualiza a linha com novos valores + last_lat/lng/timestamp
- `resetTripDistance(db)` — zera distance_m e campos last_*
- `resetTripAvgSpeed(db)` — zera moving_time_s (e distance_m tambem, pois vel. media depende da distancia)

Nota: resetar vel. media tambem zera distancia porque `avg = distance / time`. Se so zerasse o tempo, a media ficaria infinita. Alternativa: resetar ambos independentemente, mas isso gera valores sem sentido. Decisao: reset de vel. media reseta ambos. Reset de Trip A reseta so distancia (vel. media fica inconsistente temporariamente mas recalcula com o proximo trecho).

Decisao simplificada: cada reset zera apenas seu campo. Trip A zera `distance_m`. Vel. media zera `moving_time_s` E `distance_m`. Isso porque vel. media sem distancia nao faz sentido.

## Hook: `useTrip`

### Interface

```ts
type TripState = {
  tripDistance: number;    // metros
  avgSpeed: number;        // km/h
  resetDistance: () => void;
  resetAvgSpeed: () => void;
};
```

### Parametros

```ts
useTrip(location: LocationState | null, speed: number): TripState
```

### Logica

1. **Mount**: Abre banco SQLite, carrega dados existentes.
2. **GPS update** (quando `location` muda):
   - Se `speed < 2 km/h`, ignora (evita drift GPS parado).
   - Se tem `last_lat/lng`, calcula distancia ate posicao atual (Haversine).
   - Acumula `distance_m += delta`.
   - Calcula `delta_time = now - last_timestamp`.
   - Acumula `moving_time_s += delta_time`.
   - Persiste no banco.
3. **Vel. media**: `(distance_m / moving_time_s) * 3.6` (m/s → km/h). Se `moving_time_s == 0`, retorna 0.
4. **Reset distance**: Zera `distance_m`, limpa `last_lat/lng/timestamp`.
5. **Reset avg speed**: Zera `distance_m` e `moving_time_s`, limpa `last_lat/lng/timestamp`.

### Haversine

Funcao utilitaria no proprio hook (ou em `utils/geo.ts` se preferir):

```ts
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number
```

Retorna distancia em metros.

## Componente: `TripInfo`

### Props

```ts
type Props = {
  tripDistance: number;    // metros
  avgSpeed: number;        // km/h
  inverted: boolean;
  onResetDistance: () => void;
  onResetAvgSpeed: () => void;
};
```

### Layout

```
──────────────────────   ← linha 1px, largura ~200px
Trip A      12.3 km  ↺  ← label + valor + botao
Media       45 km/h  ↺  ← label + valor + botao
```

### Posicionamento (em `index.tsx`)

O componente fica dentro do mesmo wrapper do Speedometer ou abaixo dele. Posicao: `absolute right-28 bottom-10` — alinhado verticalmente com bateria (`bottom-11 left-28`) e relogio (`bottom-10 left-[385px]`).

Alternativa: agrupar Speedometer + TripInfo em um unico container `absolute right-28` com layout vertical, e o TripInfo fica embaixo naturalmente.

### Estilo

- **Linha**: `h-[1px]` com `bg-gray-600` (dark) / `bg-gray-300` (light), `w-[200px]`
- **Labels** ("Trip A", "Media"): `text-lg`, `color: #9ca3af` (dark) / `#374151` (light) — mesma cor do "km/h"
- **Valores**: `text-lg font-bold`, mesma cor dos labels
- **Botao reset**: FontAwesome `undo` icon, tamanho 16, cor cinza, `Pressable` com `onPress`
- **Formato Trip A**: `< 1000m` → "123 m", `>= 1km` → "12.3 km"
- **Formato vel. media**: "45 km/h", sem decimais

## Fluxo de dados

```
index.tsx
├── useLocation() → location, speed
├── useTrip(location, speed) → tripDistance, avgSpeed, resetDistance, resetAvgSpeed
│
└── <TripInfo
      tripDistance={tripDistance}
      avgSpeed={avgSpeed}
      inverted={settings.inverted}
      onResetDistance={resetDistance}
      onResetAvgSpeed={resetAvgSpeed}
    />
```

## Edge cases

- **App reaberto**: Banco carrega valores anteriores. `last_timestamp` pode ser antigo — o primeiro GPS update apos reabrir descarta o delta de tempo (verifica se `delta_time > 60s`, se sim, ignora e so atualiza `last_*`).
- **GPS indisponivel**: `location` null → hook nao acumula.
- **Velocidade zero**: `speed < 2 km/h` → nao acumula distancia nem tempo.
- **Startup animation**: Usa `effectiveSpeed` que durante startup e a animacao (0→240→0). O hook deve receber a speed real do GPS, nao a de startup, para nao acumular lixo. Decisao: passar `speed` (GPS real) ao invés de `effectiveSpeed`.
