import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

import { GOOGLE_MAPS_KEY } from "@/constants";

type SpeedLimitResult = {
  limit: number | null;
  source: "roads_api" | "none" | "error";
  roadName?: string;
};

/**
 * Consulta a Google Roads API Speed Limits para obter o limite de velocidade
 * da via mais proxima das coordenadas fornecidas.
 *
 * Envia as coordenadas e recebe o limite em KPH.
 * Retorna null quando nenhum limite eh encontrado ou em caso de erro.
 */
async function fetchRoadSpeedLimit(
  lat: number,
  lng: number,
): Promise<SpeedLimitResult> {
  const url = `https://roads.googleapis.com/v1/speedLimits?path=${lat},${lng}&units=KPH&key=${GOOGLE_MAPS_KEY}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Roads API retornou status ${res.status}`);
      return { limit: null, source: "error" };
    }

    const data = await res.json();

    if (data.speedLimits && data.speedLimits.length > 0) {
      return {
        limit: data.speedLimits[0].speedLimit,
        source: "roads_api",
      };
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
 * - Consulta a Google Roads API Speed Limits a cada 15s quando em modo automatico
 * - Retorna o limite em KPH da via mais proxima das coordenadas
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
