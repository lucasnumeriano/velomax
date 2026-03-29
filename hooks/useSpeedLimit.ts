import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import Toast from "react-native-toast-message";

import { GOOGLE_MAPS_KEY } from "@/constants";

// Hierarquia de vias para selecionar a de maior prioridade quando
// multiplas vias sao retornadas pela Overpass API no mesmo raio
const ROAD_HIERARCHY: Record<string, number> = {
  motorway: 7,
  motorway_link: 6,
  trunk: 5,
  trunk_link: 4,
  primary: 3,
  secondary: 3,
  tertiary: 2,
  residential: 1,
  living_street: 1,
  unclassified: 1,
};

// Limites padrao do CTB brasileiro (Codigo de Transito Brasileiro) por tipo de via:
// - Vias locais: 30 km/h (residential, living_street)
// - Vias coletoras: 40 km/h (tertiary, unclassified)
// - Vias arteriais: 60 km/h (primary, secondary)
// - Vias de transito rapido: 80 km/h (trunk)
// - Rodovias pista dupla: 110 km/h (motorway)
// - Rodovias pista simples: 100 km/h (motorway sem dual_carriageway)
const BR_SPEED_DEFAULTS: Record<string, number> = {
  motorway: 110,
  motorway_link: 60,
  trunk: 80,
  trunk_link: 60,
  primary: 60,
  secondary: 60,
  tertiary: 40,
  residential: 30,
  living_street: 30,
  unclassified: 40,
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type SpeedLimitResult = {
  limit: number | null;
  source: "osm" | "ctb_default" | "name_fallback" | "none" | "error" | "rate_limit";
  roadName?: string;
};

/**
 * Determina se uma via eh pista dupla baseado nas tags OSM.
 * Checa oneway, dual_carriageway e numero de faixas.
 */
function isDualCarriageway(tags: Record<string, string>): boolean {
  if (tags.oneway === "yes") return true;
  if (tags.dual_carriageway === "yes") return true;
  const lanes = parseInt(tags.lanes, 10);
  if (!isNaN(lanes) && lanes >= 4) return true;
  return false;
}

/**
 * Calcula o limite CTB para uma via, considerando diferenciacao
 * entre rodovia pista dupla (110) e pista simples (100).
 */
function getCtbSpeedLimit(tags: Record<string, string>): number | null {
  const hwType = tags.highway;
  if (!hwType || BR_SPEED_DEFAULTS[hwType] === undefined) return null;

  if (hwType === "motorway") {
    return isDualCarriageway(tags) ? 110 : 100;
  }

  return BR_SPEED_DEFAULTS[hwType];
}

/**
 * Seleciona a via de maior hierarquia entre os resultados da Overpass API.
 * Isso evita que uma via local paralela a uma rodovia seja selecionada.
 */
function selectHighestPriorityRoad(
  elements: Array<{ tags: Record<string, string> }>,
): { tags: Record<string, string> } | null {
  if (elements.length === 0) return null;

  let bestRoad = elements[0];
  let bestPriority = ROAD_HIERARCHY[bestRoad.tags?.highway] ?? 0;

  for (let i = 1; i < elements.length; i++) {
    const road = elements[i];
    const priority = ROAD_HIERARCHY[road.tags?.highway] ?? 0;
    if (priority > bestPriority) {
      bestRoad = road;
      bestPriority = priority;
    }
  }

  return bestRoad;
}

/**
 * Normaliza nome de rua para comparacao: remove acentos, converte para
 * lowercase e strip prefixos comuns (Av., R., Rua, Avenida, etc.).
 */
function normalizeRoadName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /^(avenida|av\.?|rua|r\.?|travessa|tv\.?|alameda|al\.?|praca|pc\.?|rodovia|rod\.?|estrada|estr?\.?|via)\s+/i,
      "",
    )
    .trim();
}

/**
 * Busca entre os resultados do Overpass a via cujo nome melhor corresponde
 * ao nome retornado pelo Google Geocoding.
 * Usa match parcial case-insensitive sem acentos.
 */
function matchRoadByName(
  elements: Array<{ tags: Record<string, string> }>,
  googleName: string,
): { tags: Record<string, string> } | null {
  const normalizedGoogle = normalizeRoadName(googleName);
  if (!normalizedGoogle) return null;

  for (const el of elements) {
    const osmName = el.tags?.name;
    if (!osmName) continue;

    const normalizedOsm = normalizeRoadName(osmName);
    if (!normalizedOsm) continue;

    if (
      normalizedOsm.includes(normalizedGoogle) ||
      normalizedGoogle.includes(normalizedOsm)
    ) {
      return el;
    }
  }

  return null;
}

/**
 * Consulta a Google Reverse Geocoding API para obter o nome da rua
 * nas coordenadas fornecidas. Retorna null em caso de erro ou
 * quando nenhuma rua eh encontrada.
 */
async function fetchRoadName(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=route&language=pt-BR&key=${GOOGLE_MAPS_KEY}`;

  try {
    const res = await fetch(url, { signal });

    if (!res.ok) {
      console.warn(`Google Geocoding retornou status ${res.status}`);
      return null;
    }

    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const components = data.results[0].address_components;
      const route = components?.find((c: any) =>
        c.types.includes("route"),
      );
      return route?.long_name ?? null;
    }

    return null;
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    console.warn("Erro ao consultar Google Geocoding:", e);
    return null;
  }
}

/**
 * Consulta a Overpass API para obter todas as vias num raio de 50m
 * das coordenadas fornecidas. Retorna os elementos com suas tags.
 */
async function fetchOverpassRoads(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<
  | { elements: Array<{ tags: Record<string, string> }>; rateLimit: false }
  | { elements: []; rateLimit: true }
  | null
> {
  const query = `
    [out:json][timeout:10];
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary|tertiary|residential|living_street|unclassified)$"](around:50,${lat},${lng});
    out tags;
  `;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal,
    });

    if (!res.ok) {
      console.warn(`Overpass API retornou status ${res.status}`);

      if (res.status === 429) {
        return { elements: [], rateLimit: true };
      }

      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      console.warn(
        `Overpass API retornou content-type inesperado: ${contentType}`,
      );
      return null;
    }

    const data = await res.json();
    return { elements: data.elements ?? [], rateLimit: false };
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    console.warn("Erro ao consultar Overpass API:", e);
    return null;
  }
}

/**
 * Extrai o limite de velocidade de uma via OSM selecionada.
 * Tenta usar maxspeed explicito, senao infere pelo CTB.
 */
function extractSpeedLimit(
  tags: Record<string, string>,
): { limit: number | null; source: "osm" | "ctb_default" | "none" } {
  if (tags.maxspeed) {
    const maxspeed = tags.maxspeed;

    if (maxspeed === "none") {
      return { limit: null, source: "osm" };
    }

    if (maxspeed === "BR:urban") {
      return { limit: 60, source: "osm" };
    }
    if (maxspeed === "BR:rural") {
      return { limit: 100, source: "osm" };
    }

    const numMatch = maxspeed.match(/^(\d+)/);
    if (numMatch) {
      return { limit: parseInt(numMatch[1], 10), source: "osm" };
    }
  }

  const ctbLimit = getCtbSpeedLimit(tags);
  if (ctbLimit !== null) {
    return { limit: ctbLimit, source: "ctb_default" };
  }

  return { limit: null, source: "none" };
}

/**
 * Infere o limite de velocidade a partir do nome da rua retornado pelo Google.
 * Usado como fallback quando a Overpass API nao retorna dados para a via.
 *
 * - Rodovias federais (BR-xxx): 110 km/h
 * - Rodovias estaduais (XX-xxx) ou genéricas ("Rodovia", "Estrada"): 60 km/h
 * - Vias urbanas (Rua, Avenida, etc.): 30 km/h
 */
function inferSpeedLimitFromName(roadName: string): number {
  const normalized = roadName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Rodovia federal: BR-xxx
  if (/\bbr[-\s]?\d{2,3}\b/.test(normalized)) {
    return 110;
  }

  // Rodovia estadual: XX-xxx (sigla de estado + digitos)
  const statePattern =
    /\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)[-\s]?\d{2,3}\b/;
  if (statePattern.test(normalized)) {
    return 60;
  }

  // Rodovia/estrada generica sem numero
  if (/\b(rodovia|estrada|via)\b/.test(normalized)) {
    return 60;
  }

  // Default: via urbana (rua, avenida, travessa, etc.)
  return 30;
}

/**
 * Consulta a Overpass API para obter o limite de velocidade da via,
 * usando o nome do Google para selecionar a via correta entre os resultados.
 *
 * 1. Busca todas as vias num raio de 50m das coordenadas
 * 2. Se roadName fornecido, tenta match parcial pelo nome
 * 3. Fallback: seleciona via de maior hierarquia
 * 4. Extrai maxspeed ou aplica CTB defaults
 */
async function fetchOverpassSpeedLimit(
  lat: number,
  lng: number,
  roadName: string | null,
): Promise<SpeedLimitResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const overpassResult = await fetchOverpassRoads(
      lat,
      lng,
      controller.signal,
    );
    clearTimeout(timeout);

    if (!overpassResult) {
      return { limit: null, source: "error", roadName: roadName ?? undefined };
    }

    if (overpassResult.rateLimit) {
      return {
        limit: 60,
        source: "rate_limit",
        roadName: roadName ?? undefined,
      };
    }

    if (overpassResult.elements.length === 0) {
      return { limit: null, source: "none", roadName: roadName ?? undefined };
    }

    // Selecionar via: match por nome (Google) ou fallback por hierarquia
    let selectedRoad: { tags: Record<string, string> } | null = null;

    if (roadName) {
      selectedRoad = matchRoadByName(overpassResult.elements, roadName);
    }

    if (!selectedRoad) {
      selectedRoad = selectHighestPriorityRoad(overpassResult.elements);
    }

    if (!selectedRoad) {
      return { limit: null, source: "none", roadName: roadName ?? undefined };
    }

    const { limit, source } = extractSpeedLimit(selectedRoad.tags);

    return {
      limit,
      source,
      roadName: roadName ?? selectedRoad.tags.name,
    };
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      return { limit: null, source: "error" };
    }
    console.error("Erro ao consultar limite de velocidade:", e);
    return { limit: null, source: "error" };
  }
}

type UseSpeedLimitReturn = {
  speedLimit: number | null;
  speedLimitMode: "auto" | "manual";
  autoSpeedLimit: number | null;
  roadName: string | null;
  flashAnim: Animated.Value;
  setSpeedLimit: (limit: number | null) => void;
  setSpeedLimitMode: (mode: "auto" | "manual") => void;
  setAutoSpeedLimit: (limit: number | null) => void;
  autoSpeedLimitRef: React.MutableRefObject<number | null>;
};

/**
 * Hook que gerencia a deteccao automatica de limite de velocidade
 * e o alerta de excesso de velocidade.
 *
 * Deteccao automatica (hibrida Google + Overpass):
 * - A cada 15s, consulta Google Geocoding para identificar a rua
 * - So consulta Overpass quando o nome da rua muda (economia de requests)
 * - Usa o nome do Google para selecionar a via correta no Overpass
 * - Fallback por hierarquia de via quando o nome nao corresponde
 * - Usa limites CTB quando a via nao tem maxspeed no OSM
 * - Fallback pelo nome da rua quando Overpass nao retorna dados:
 *   - Rodovia federal (BR-xxx): 110 km/h
 *   - Rodovia estadual (XX-xxx) / generica: 60 km/h
 *   - Via urbana (rua, avenida, etc.): 30 km/h
 * - Trata rate limit (429) com fallback de 60 km/h + toast
 *
 * Alerta de excesso:
 * - Toca alarme quando velocidade ultrapassa o limite
 * - Se apos 1 minuto ainda estiver acima, toca novamente
 * - Reseta quando velocidade volta abaixo do limite
 *
 * Alerta de zona:
 * - Flash visual quando o limite diminui (zona mais restritiva)
 *
 * @param location - Coordenadas atuais do GPS
 * @param initialMode - Modo inicial (auto/manual) carregado do AsyncStorage
 * @param initialLimit - Limite inicial carregado do AsyncStorage
 * @param speed - Velocidade atual em km/h
 */
export function useSpeedLimit(
  location: { latitude: number; longitude: number } | null,
  initialMode: "auto" | "manual",
  initialLimit: number | null,
  speed: number,
): UseSpeedLimitReturn {
  const [speedLimit, setSpeedLimit] = useState<number | null>(initialLimit);
  const [speedLimitMode, setSpeedLimitMode] = useState<"auto" | "manual">(
    initialMode,
  );
  const [autoSpeedLimit, setAutoSpeedLimit] = useState<number | null>(null);
  const [roadName, setRoadName] = useState<string | null>(null);

  const alertSoundRef = useRef<Audio.Sound | null>(null);
  const speedLimitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const autoSpeedLimitRef = useRef<number | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Ref para location — evita que o useEffect do polling reinicie a cada update GPS
  const locationRef = useRef(location);

  // Ref para nome da ultima rua — so consulta Overpass quando muda de rua
  const lastRoadNameRef = useRef<string | null>(null);

  // Refs para alarme de excesso de velocidade
  const isExceedingRef = useRef(false);
  const exceedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(speed);
  const speedLimitRef = useRef(speedLimit);

  // Manter refs atualizados para uso nos timers/polling
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    speedLimitRef.current = speedLimit;
  }, [speedLimit]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Carregar som de alerta
  useEffect(() => {
    (async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
      });

      try {
        const { sound } = await Audio.Sound.createAsync(
          require("../assets/audios/flutie8211-high-pitch-alarm-buzzer-464349.mp3"),
        );
        alertSoundRef.current = sound;
      } catch (e) {
        console.error("Erro ao carregar som de alerta:", e);
      }
    })();

    return () => {
      alertSoundRef.current?.unloadAsync();
    };
  }, []);

  // Tocar som de alerta
  const playAlertSound = async () => {
    try {
      if (alertSoundRef.current) {
        await alertSoundRef.current.replayAsync();
      }
    } catch (e) {
      console.error("Erro ao tocar alerta:", e);
    }
  };

  // Flash visual no botao MAX (pisca amarelo/laranja 3x em 1.5s)
  const triggerFlash = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
      ]),
      { iterations: 3 },
    ).start();
  };

  // Agendar repeticao do alarme de excesso em 1 minuto
  const scheduleExceedRepeat = () => {
    if (exceedTimerRef.current) {
      clearTimeout(exceedTimerRef.current);
    }

    exceedTimerRef.current = setTimeout(() => {
      // Verificar via ref se ainda esta excedendo no momento do timer
      if (
        isExceedingRef.current &&
        speedLimitRef.current !== null &&
        speedRef.current > speedLimitRef.current
      ) {
        playAlertSound();
        triggerFlash();
        // Reagendar para mais 1 minuto
        scheduleExceedRepeat();
      }
    }, 60_000);
  };

  // Monitorar excesso de velocidade
  useEffect(() => {
    if (speedLimit === null) {
      // Sem limite definido — resetar estado de excesso
      if (isExceedingRef.current) {
        isExceedingRef.current = false;
        if (exceedTimerRef.current) {
          clearTimeout(exceedTimerRef.current);
          exceedTimerRef.current = null;
        }
      }
      return;
    }

    const exceeding = speed > speedLimit;

    if (exceeding && !isExceedingRef.current) {
      // Acabou de exceder — toca alarme imediato + agenda repeticao
      isExceedingRef.current = true;
      playAlertSound();
      triggerFlash();
      scheduleExceedRepeat();
    } else if (!exceeding && isExceedingRef.current) {
      // Voltou abaixo do limite — reseta para poder tocar novamente
      isExceedingRef.current = false;
      if (exceedTimerRef.current) {
        clearTimeout(exceedTimerRef.current);
        exceedTimerRef.current = null;
      }
    }
  }, [speed, speedLimit]);

  // Cleanup do timer de excesso ao desmontar
  useEffect(() => {
    return () => {
      if (exceedTimerRef.current) {
        clearTimeout(exceedTimerRef.current);
        exceedTimerRef.current = null;
      }
    };
  }, []);

  // Polling de limite de velocidade automatico
  // 1. A cada 15s, consulta Google Geocoding para identificar a rua
  // 2. Se mesma rua, mantem limite atual (evita chamadas desnecessarias ao Overpass)
  // 3. Se rua mudou, consulta Overpass para obter o limite
  // 4. Se Overpass nao retorna limite, infere pelo nome da rua (federal/estadual/urbana)
  useEffect(() => {
    if (speedLimitMode !== "auto") {
      if (speedLimitIntervalRef.current) {
        clearInterval(speedLimitIntervalRef.current);
        speedLimitIntervalRef.current = null;
      }
      return;
    }

    const checkSpeedLimit = async () => {
      const loc = locationRef.current;
      if (!loc) return;

      // Step 1: Identificar a rua via Google Geocoding
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const newRoadName = await fetchRoadName(
        loc.latitude,
        loc.longitude,
        controller.signal,
      );
      clearTimeout(timeout);

      // Step 2: Se mesma rua e ja temos limite, manter (skip Overpass)
      if (
        newRoadName &&
        newRoadName === lastRoadNameRef.current &&
        autoSpeedLimitRef.current !== null
      ) {
        return;
      }

      // Step 3: Rua mudou — atualizar nome e consultar Overpass
      lastRoadNameRef.current = newRoadName;
      setRoadName(newRoadName);

      const result = await fetchOverpassSpeedLimit(
        loc.latitude,
        loc.longitude,
        newRoadName,
      );

      if (result.source === "error") return;

      // Rate limit — exibir toast e usar fallback
      if (result.source === "rate_limit") {
        Toast.show({
          type: "info",
          text1: "Limite automatico indisponivel",
          text2: "Usando 60 km/h como fallback. Tente novamente em breve.",
          visibilityTime: 5000,
          position: "bottom",
        });
      }

      // Step 4: Fallback pelo nome da rua quando Overpass nao retorna limite
      let limit = result.limit;

      if (limit === null && newRoadName) {
        limit = inferSpeedLimitFromName(newRoadName);
      }

      if (limit !== null) {
        const previousLimit = autoSpeedLimitRef.current;
        autoSpeedLimitRef.current = limit;
        setAutoSpeedLimit(limit);
        setSpeedLimit(limit);

        // Flash visual quando o limite diminui (entrando em zona mais restritiva)
        if (previousLimit !== null && limit < previousLimit) {
          triggerFlash();
        }
      } else {
        autoSpeedLimitRef.current = null;
        setAutoSpeedLimit(null);
        setSpeedLimit(null);
      }
    };

    // Reset para forcar consulta Overpass na primeira chamada apos trocar de modo
    lastRoadNameRef.current = null;

    checkSpeedLimit();
    speedLimitIntervalRef.current = setInterval(checkSpeedLimit, 15000);

    return () => {
      if (speedLimitIntervalRef.current) {
        clearInterval(speedLimitIntervalRef.current);
        speedLimitIntervalRef.current = null;
      }
    };
  }, [speedLimitMode]);

  return {
    speedLimit,
    speedLimitMode,
    autoSpeedLimit,
    roadName,
    flashAnim,
    setSpeedLimit,
    setSpeedLimitMode,
    setAutoSpeedLimit,
    autoSpeedLimitRef,
  };
}
