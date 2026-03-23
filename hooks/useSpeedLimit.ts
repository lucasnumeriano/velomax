import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

// Limites padrao do CTB brasileiro por tipo de via
const BR_SPEED_DEFAULTS: Record<string, number> = {
  motorway: 110,
  trunk: 100,
  primary: 60,
  secondary: 60,
  tertiary: 40,
  residential: 40,
  living_street: 20,
  unclassified: 60,
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type SpeedLimitResult = {
  limit: number | null;
  source: "osm" | "ctb_default" | "none" | "error";
  roadName?: string;
};

/**
 * Consulta a Overpass API (OpenStreetMap) para obter o limite de velocidade
 * da via mais proxima das coordenadas fornecidas.
 *
 * Fallback: quando a via nao tem tag maxspeed, infere pelo tipo de via
 * usando os limites padrao do CTB brasileiro.
 */
async function fetchRoadSpeedLimit(
  lat: number,
  lng: number,
): Promise<SpeedLimitResult> {
  const query = `
    [out:json][timeout:10];
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)$"](around:30,${lat},${lng});
    out tags 1;
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
      const road = data.elements[0];
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

      // Fallback: inferir pelo tipo de via (CTB)
      const hwType = tags.highway;
      if (hwType && BR_SPEED_DEFAULTS[hwType] !== undefined) {
        return {
          limit: BR_SPEED_DEFAULTS[hwType],
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
 * Hook que gerencia a deteccao automatica de limite de velocidade.
 *
 * - Consulta a Overpass API a cada 15s quando em modo automatico
 * - Dispara alerta sonoro + visual quando o limite diminui (zona mais restritiva)
 * - Cooldown de 2 minutos entre alertas
 * - Suporta modo manual (presets) e automatico (API)
 *
 * @param location - Coordenadas atuais do GPS
 * @param initialMode - Modo inicial (auto/manual) carregado do AsyncStorage
 * @param initialLimit - Limite inicial carregado do AsyncStorage
 */
export function useSpeedLimit(
  location: { latitude: number; longitude: number } | null,
  initialMode: "auto" | "manual",
  initialLimit: number | null,
): UseSpeedLimitReturn {
  const [speedLimit, setSpeedLimit] = useState<number | null>(initialLimit);
  const [speedLimitMode, setSpeedLimitMode] = useState<"auto" | "manual">(
    initialMode,
  );
  const [autoSpeedLimit, setAutoSpeedLimit] = useState<number | null>(null);
  const [roadName, setRoadName] = useState<string | null>(null);

  const alertSoundRef = useRef<Audio.Sound | null>(null);
  const lastAlertTimeRef = useRef<number>(0);
  const speedLimitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const autoSpeedLimitRef = useRef<number | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

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

  // Disparar alerta de mudanca de limite
  const playSpeedLimitAlert = async () => {
    const now = Date.now();
    const cooldown = 2 * 60 * 1000; // 2 minutos

    if (now - lastAlertTimeRef.current < cooldown) {
      return;
    }

    lastAlertTimeRef.current = now;

    try {
      if (alertSoundRef.current) {
        await alertSoundRef.current.replayAsync();
      }
    } catch (e) {
      console.error("Erro ao tocar alerta:", e);
    }

    // Flash visual no botao MAX (pisca amarelo/laranja 3x em 1.5s)
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
      if (!location) return;

      const result = await fetchRoadSpeedLimit(
        location.latitude,
        location.longitude,
      );

      if (result.source === "error") return;

      setRoadName(result.roadName ?? null);

      if (result.limit !== null) {
        const previousLimit = autoSpeedLimitRef.current;
        autoSpeedLimitRef.current = result.limit;
        setAutoSpeedLimit(result.limit);
        setSpeedLimit(result.limit);

        if (previousLimit !== null && result.limit < previousLimit) {
          playSpeedLimitAlert();
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
  }, [speedLimitMode, location]);

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
