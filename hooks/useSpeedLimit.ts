import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import Toast from "react-native-toast-message";

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
  source: "osm" | "ctb_default" | "none" | "error" | "rate_limit";
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

  // Para motorway: diferenciar pista dupla (110) vs pista simples (100)
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
 * Consulta a Overpass API (OpenStreetMap) para obter o limite de velocidade
 * da via mais proxima das coordenadas fornecidas.
 *
 * Busca todas as vias num raio de 50m e seleciona a de maior hierarquia.
 * Fallback: quando a via nao tem tag maxspeed, infere pelo tipo de via
 * usando os limites padrao do CTB brasileiro, diferenciando pista dupla/simples.
 *
 * Em caso de rate limit (429), retorna 60 km/h como fallback seguro.
 */
async function fetchRoadSpeedLimit(
  lat: number,
  lng: number,
): Promise<SpeedLimitResult> {
  const query = `
    [out:json][timeout:10];
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary|tertiary|residential|living_street|unclassified)$"](around:50,${lat},${lng});
    out tags;
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Overpass API retornou status ${res.status}`);

      // Rate limit — fallback seguro de 60 km/h (via arterial)
      if (res.status === 429) {
        return { limit: 60, source: "rate_limit" };
      }

      return { limit: null, source: "error" };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      console.warn(
        `Overpass API retornou content-type inesperado: ${contentType}`,
      );
      return { limit: null, source: "error" };
    }

    const data = await res.json();

    if (data.elements && data.elements.length > 0) {
      // Selecionar via de maior hierarquia entre todos os resultados
      const road = selectHighestPriorityRoad(data.elements);
      if (!road) return { limit: null, source: "none" };

      const tags = road.tags || {};

      // Tentar usar maxspeed explicito
      if (tags.maxspeed) {
        const maxspeed = tags.maxspeed;

        if (maxspeed === "none") {
          return { limit: null, source: "osm", roadName: tags.name };
        }

        // Valores implicitos brasileiros
        if (maxspeed === "BR:urban") {
          return { limit: 60, source: "osm", roadName: tags.name };
        }
        if (maxspeed === "BR:rural") {
          return { limit: 100, source: "osm", roadName: tags.name };
        }

        // Valor numerico (com ou sem unidade)
        const numMatch = maxspeed.match(/^(\d+)/);
        if (numMatch) {
          return {
            limit: parseInt(numMatch[1], 10),
            source: "osm",
            roadName: tags.name,
          };
        }
      }

      // Fallback: inferir pelo tipo de via (CTB), com diferenciacao pista dupla/simples
      const ctbLimit = getCtbSpeedLimit(tags);
      if (ctbLimit !== null) {
        return {
          limit: ctbLimit,
          source: "ctb_default",
          roadName: tags.name,
        };
      }
    }

    return { limit: null, source: "none" };
  } catch (e: any) {
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
 * Deteccao automatica:
 * - Consulta a Overpass API a cada 15s quando em modo automatico
 * - Seleciona a via de maior hierarquia (evita vias paralelas)
 * - Usa limites CTB quando a via nao tem maxspeed no OSM
 * - Diferencia rodovia pista dupla (110) vs pista simples (100)
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

  // Ref para evitar toast repetido de rate limit / indisponivel
  const toastShownRef = useRef(false);

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

      const result = await fetchRoadSpeedLimit(loc.latitude, loc.longitude);

      if (result.source === "error") return;

      // Rate limit — exibir toast uma unica vez e usar fallback
      if (result.source === "rate_limit") {
        if (!toastShownRef.current) {
          toastShownRef.current = true;
          Toast.show({
            type: "info",
            text1: "Limite automatico indisponivel",
            text2: "Usando 60 km/h como fallback. Tente novamente em breve.",
            visibilityTime: 10000,
            position: "bottom",
          });
        }
      } else {
        // Condicao normalizada — resetar flag para permitir toast futuro
        toastShownRef.current = false;
      }

      setRoadName(result.roadName ?? null);

      if (result.limit !== null) {
        const previousLimit = autoSpeedLimitRef.current;
        autoSpeedLimitRef.current = result.limit;
        setAutoSpeedLimit(result.limit);
        setSpeedLimit(result.limit);

        // Flash visual quando o limite diminui (entrando em zona mais restritiva)
        if (previousLimit !== null && result.limit < previousLimit) {
          triggerFlash();
        }
      } else {
        autoSpeedLimitRef.current = null;
        setAutoSpeedLimit(null);
        setSpeedLimit(null);
      }
    };

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
