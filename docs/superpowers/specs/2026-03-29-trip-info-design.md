# Trip A + Velocidade Media

## Resumo

Adicionar Trip A (distancia percorrida) e velocidade media ao HUD, posicionados abaixo do velocimetro com uma linha separadora. Cada metrica tem um botao de reset individual. Dados persistidos em `expo-sqlite`.

## Arquitetura

### Novos arquivos

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| `db/trip.ts` | Camada de dados | Abre banco SQLite, cria tabela, expoe CRUD |
| `db/index.ts` | Barrel file | Re-exporta tudo de `db/trip.ts` |
| `hooks/useTrip.ts` | Hook | Acumula distancia, calcula vel. media, persiste |
| `components/TripInfo.tsx` | Componente | Exibe Trip A, vel. media, linha, botoes reset |

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `app/index.tsx` | Importa `useTrip` e `TripInfo`, agrupa Speedometer + TripInfo em container vertical |
| `components/index.ts` | Re-exporta `TripInfo` |
| `hooks/index.ts` | Re-exporta `useTrip` e `TripState` |

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
- `resetTripDistance(db)` — zera `distance_m` e campos `last_*`. Nao afeta `moving_time_s`.
- `resetTripAvgSpeed(db)` — zera `distance_m` E `moving_time_s` e campos `last_*`. Ambos sao zerados porque vel. media = distancia / tempo; zerar so o tempo sem a distancia produziria valores sem sentido.

## Hook: `useTrip`

### Interface

```ts
/** Estado e controles do trip computer. Exportado via hooks/index.ts. */
type TripState = {
  tripDistance: number;    // metros
  avgSpeed: number;        // km/h
  resetDistance: () => void;
  resetAvgSpeed: () => void;
};
```

### Parametros

```ts
/**
 * @param location - posicao GPS atual (de useLocation). null = sem GPS.
 * @param speed - velocidade GPS real em km/h (de useLocation). NAO usar effectiveSpeed.
 */
useTrip(location: LocationState | null, speed: number): TripState
```

O parametro `speed` deve ser a velocidade GPS real retornada por `useLocation`, nunca `effectiveSpeed` (que inclui a animacao de startup 0→240→0 e simulacao).

### Logica

1. **Mount**: Abre banco SQLite, carrega dados existentes.
2. **GPS update** (quando `location` muda):
   - Se `speed < 2 km/h`, ignora (evita drift GPS parado). Atualiza `last_lat/lng/timestamp` para nao perder a referencia.
   - Se tem `last_lat/lng`, calcula distancia ate posicao atual (Haversine).
   - Sanity check: se `delta_distance > 500m`, descarta (GPS jump). So atualiza `last_*`.
   - Calcula `delta_time = Date.now() - last_timestamp`.
   - Se `delta_time > 60s`, descarta (app ficou em background ou GPS sumiu). So atualiza `last_*`.
   - Acumula `distance_m += delta_distance`.
   - Acumula `moving_time_s += delta_time / 1000`.
   - Persiste no banco a cada 5 segundos (throttle). Mantem valores em memoria (useRef) entre escritas.
3. **Vel. media**: `(distance_m / moving_time_s) * 3.6` (m/s → km/h). Se `moving_time_s == 0`, retorna 0.
4. **Reset distance**: Zera `distance_m`, limpa `last_lat/lng/timestamp`. Nao afeta `moving_time_s`.
5. **Reset avg speed**: Zera `distance_m` e `moving_time_s`, limpa `last_lat/lng/timestamp`.

### Haversine

Funcao utilitaria privada dentro de `hooks/useTrip.ts` (nenhum outro modulo precisa dela):

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

O Speedometer e TripInfo ficam agrupados em um unico container vertical `absolute right-28`, centralizados. Assim o TripInfo fica naturalmente abaixo do Speedometer sem duplicar posicionamento absoluto.

```tsx
<View className="absolute right-28 items-center justify-center">
  <Speedometer ... />
  <TripInfo ... />
</View>
```

Alinhamento vertical com bateria (`bottom-11`) e relogio (`bottom-10`) — ambos na faixa inferior da tela.

### Estilo

Usa inline `style` com ternario no prop `inverted`, seguindo o mesmo padrao do Speedometer:

- **Linha**: `h-[1px]` com `bg-gray-600` (dark) / `bg-gray-300` (light), `w-[200px]`, `my-2` para spacing
- **Labels** ("Trip A", "Media"): `text-lg`, cor via inline style: `#9ca3af` (dark) / `#374151` (light) — mesma cor do "km/h" do Speedometer
- **Valores**: `text-lg font-bold`, mesma cor dos labels, via inline style
- **Botao reset**: FontAwesome `undo` icon, tamanho 16, cor `#6b7280` (cinza), `Pressable` com `onPress`
- **Formato Trip A**: `< 1000m` → "123 m", `>= 1km` → "12.3 km"
- **Formato vel. media**: "45 km/h", sem decimais

## Fluxo de dados

```
index.tsx
├── useLocation() → location, speed
├── useTrip(location, speed) → tripDistance, avgSpeed, resetDistance, resetAvgSpeed
│
└── <View className="absolute right-28 items-center justify-center">
      <Speedometer speed={effectiveSpeed} smoothSpeed={effectiveSmoothSpeed} ... />
      <TripInfo
        tripDistance={tripDistance}
        avgSpeed={avgSpeed}
        inverted={settings.inverted}
        onResetDistance={resetDistance}
        onResetAvgSpeed={resetAvgSpeed}
      />
    </View>
```

## Edge cases

- **App reaberto**: Banco carrega valores anteriores. Se `delta_time > 60s` desde o ultimo update, descarta esse delta e so atualiza `last_*`. Distancia e tempo acumulados permanecem.
- **GPS indisponivel**: `location` null → hook nao acumula nada.
- **Velocidade zero**: `speed < 2 km/h` → nao acumula distancia nem tempo. Atualiza `last_*` para manter referencia.
- **GPS jump**: Se distancia entre dois updates > 500m, descarta (teleporte GPS). So atualiza `last_*`.
- **Startup animation**: O hook recebe `speed` real do GPS (nao `effectiveSpeed`), entao nao acumula durante a animacao 0→240→0. Alem disso, `location` so fica disponivel apos GPS lock, entao o hook naturalmente fica inativo durante startup.
- **Persistencia throttle**: Escritas ao banco a cada 5s. Se o app fechar entre escritas, perde no maximo 5s de dados.
