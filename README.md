# VeloMax

HUD (head-up display) veicular para Android, construído com Expo e React Native.
Projetado para uso com o celular montado no painel do carro ou da moto: roda travado em
**landscape**, mantém a tela ligada e usa tema escuro de alto contraste.

Interface em português, com limites de velocidade seguindo o CTB (Código de Trânsito Brasileiro).

## Funcionalidades

- **Velocímetro** — leitura de velocidade via GPS com suavização adaptativa e zona morta
- **Arco de velocidade** — indicador gráfico com marcações e detecção de limite da via
- **Limite de velocidade automático** — identifica o tipo de via pela Overpass API (OpenStreetMap),
  com fallback para os padrões do CTB, e dispara alerta sonoro ao ultrapassar
- **Mini-mapa** — mapa estilo radar com orientação por bússola fundida com heading do GPS
- **Navegação** — busca de endereço com autocomplete, rota traçada e ETA
- **Trip** — distância percorrida e velocidade média, com dois acumuladores independentes (A/B),
  persistidos em SQLite
- **Controles de painel** — brilho, relógio, indicador de bateria e captura de screenshot do HUD

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Expo SDK 54, React Native 0.81, React 19 |
| Roteamento | Expo Router (file-based) |
| Estilos | NativeWind v4 (Tailwind) |
| Mapas | react-native-maps + react-native-maps-directions |
| Persistência | expo-sqlite (trips), AsyncStorage (settings) |
| Sensores | expo-location (GPS + heading), expo-battery, expo-brightness |
| Linguagem | TypeScript |

## Pré-requisitos

- [Bun](https://bun.sh) (o projeto usa `bun.lock`) ou npm
- Android SDK / Android Studio
- Uma conta no [Google Cloud](https://console.cloud.google.com) com billing ativo

> **Expo Go não funciona.** O projeto usa módulos nativos e config plugins
> (`expo-sqlite`, `expo-screen-orientation`, `react-native-maps`), então é necessário um
> [development build](https://docs.expo.dev/develop/development-builds/introduction/).

## Configuração

### 1. Instalar dependências

```bash
bun install
```

### 2. Habilitar as APIs do Google

No Google Cloud Console, crie um projeto e habilite:

| API | Usada em |
|---|---|
| **Maps SDK for Android** | renderização dos mapas |
| **Places API** | autocomplete e detalhes de endereço na busca |
| **Geocoding API** | nome da via para detecção de limite de velocidade |
| **Directions API** | traçado da rota e ETA |

A Overpass API (OpenStreetMap) também é consultada, mas é pública e não exige chave.

### 3. Criar a chave de API

Crie uma chave em **APIs & Services → Credentials** e configure o `.env`:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=sua_chave_aqui
```

> [!WARNING]
> Variáveis com prefixo `EXPO_PUBLIC_` são **embutidas no bundle em tempo de build**.
> A chave fica legível dentro do APK gerado — o `.gitignore` protege o repositório,
> mas não o binário. Antes de compartilhar qualquer build:
>
> - aplique **API restrictions** na chave, limitando às quatro APIs acima;
> - defina uma **cota diária** e um **alerta de budget** no Cloud Console.
>
> Para uso em produção, o correto é mover as chamadas REST (Places, Geocoding,
> Directions) para um backend que guarde a chave, restrita por IP.

### 4. Rodar

```bash
bun run android
```

## Scripts

| Comando | Descrição |
|---|---|
| `bun run start` | inicia o Metro bundler |
| `bun run android` | compila e roda no Android |
| `bun run lint` | ESLint via `expo lint` |
| `bun run test:speed` | roda com velocidade simulada (`EXPO_PUBLIC_SIMULATE_SPEED=true`), para testar o HUD parado |

## Estrutura

```
app/            # telas (Expo Router) — _layout.tsx trava orientação e esconde barras
components/     # componentes de UI do HUD
hooks/          # lógica de GPS, bússola, bateria, trip, limite de velocidade
db/             # camada SQLite (trips)
constants/      # env, estilo do mapa
types/  utils/  # tipos compartilhados e formatadores
```

Cada pasta tem um `index.ts` como barrel file. Imports usam o alias `@/`.

Convenções de código e arquitetura estão documentadas em [`AGENTS.md`](./AGENTS.md).

## Licença

[MIT](./LICENSE) © Lucas Numeriano
