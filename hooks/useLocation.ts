import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import MapView from "react-native-maps";

/**
 * Suaviza a transição entre dois ângulos, evitando saltos bruscos.
 * Usa fator adaptativo: curvas fortes convergem mais rápido.
 */
function smoothAngle(current: number, target: number) {
  const diff = ((target - current + 540) % 360) - 180;
  const absDiff = Math.abs(diff);
  const factor = absDiff > 45 ? 0.5 : absDiff > 15 ? 0.35 : 0.2;
  return (current + diff * factor + 360) % 360;
}

/**
 * Calcula a diferença angular entre dois headings (em graus, -180 a +180).
 */
function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Calcula a média circular de um array de ângulos em graus.
 * Usa representação sin/cos para lidar corretamente com wrap-around 0°/360°.
 */
function circularMean(angles: number[]): number {
  if (angles.length === 0) return 0;
  const toRad = Math.PI / 180;
  let sinSum = 0;
  let cosSum = 0;
  for (const a of angles) {
    sinSum += Math.sin(a * toRad);
    cosSum += Math.cos(a * toRad);
  }
  return ((Math.atan2(sinSum, cosSum) / toRad) + 360) % 360;
}

export type LocationState = {
  latitude: number;
  longitude: number;
  heading: number;
};

type UseLocationReturn = {
  location: LocationState | null;
  speed: number;
  smoothSpeed: number;
  smoothHeading: number;
};

/**
 * Hook que gerencia o rastreamento GPS com fusão de bússola.
 *
 * - Usa GPS heading quando em movimento (>5 km/h)
 * - Usa compass heading quando parado/lento (<5 km/h)
 * - Suaviza a transição entre ângulos com fator adaptativo
 * - Anima a câmera do mapa automaticamente (apenas no minimap, não no fullscreen)
 *
 * @param mapRef - Referência do MapView para animar a câmera
 * @param isFullMap - Se true, desabilita animação automática da câmera
 */
export function useLocation(
  mapRef: React.RefObject<MapView | null>,
  isFullMap: boolean,
): UseLocationReturn {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [speed, setSpeed] = useState(0);
  const [smoothSpeed, setSmoothSpeed] = useState(0);
  const [smoothHeading, setSmoothHeading] = useState(0);

  const compassHeadingRef = useRef<number | null>(null);
  const speedRef = useRef(0);
  const fullMapRef = useRef(isFullMap);
  const locationReadyRef = useRef(false);
  // Histerese para evitar oscilacao entre GPS e compass heading ao parar/andar.
  // Entra em compass mode abaixo de COMPASS_ENTER (5), so volta para GPS acima de COMPASS_EXIT (8).
  const useCompassRef = useRef(false);

  // Auto-calibracao: quando em movimento (GPS heading confiavel), mede a diferenca
  // entre GPS heading e compass heading. Aplica essa correcao quando parado.
  // Isso elimina qualquer offset fixo causado por compensacao (ou falta dela)
  // de landscape orientation no SensorManager do Android.
  const CALIBRATION_BUFFER_SIZE = 10;
  const CALIBRATION_MIN_SAMPLES = 5;
  const CALIBRATION_MIN_SPEED_KMH = 10;
  // Pre-calibracao: em LANDSCAPE_RIGHT, o topo do celular aponta para a esquerda
  // da tela, entao o compass heading bruto esta 90 graus defasado da direcao
  // "frontal" do app. Inicializar com +90 como estimativa ate a auto-calibracao
  // (que precisa de movimento >10 km/h) substituir pelo valor real.
  const LANDSCAPE_RIGHT_OFFSET = 90;
  const calibrationBufferRef = useRef<number[]>([]);
  const calibratedOffsetRef = useRef<number>(LANDSCAPE_RIGHT_OFFSET);
  const isCalibrated = useRef(false);
  const gpsHeadingRef = useRef<number | null>(null);

  // Manter ref atualizada com o valor corrente
  useEffect(() => {
    fullMapRef.current = isFullMap;
  }, [isFullMap]);

  useEffect(() => {
    let headingSubscription: Location.LocationSubscription | null = null;
    let positionSubscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      // Compass heading para quando estiver parado/lento
      headingSubscription = await Location.watchHeadingAsync((headingData) => {
        // Usar apenas trueHeading (compensado para declinacao magnetica).
        // magHeading tem offset de ~21 graus no Brasil devido a declinacao
        // magnetica — causa desalinhamento constante no mapa.
        if (headingData.trueHeading < 0) return;

        // Armazena o heading bruto do compass. O offset calibrado sera
        // aplicado no momento do uso (nao aqui), para que a calibracao
        // capture sempre o delta real entre GPS e compass.
        const rawCompass = headingData.trueHeading;
        compassHeadingRef.current = rawCompass;

        // Heading corrigido com offset (pre-calibracao: +90 para landscape-right,
        // pos-calibracao: valor aprendido do GPS)
        const correctedHeading =
          (rawCompass + calibratedOffsetRef.current + 360) % 360;

        // Quando em compass mode (histerese), atualizar mapa direto pelo compass
        // Só anima se já recebeu pelo menos uma localização GPS (MapView montado)
        if (
          useCompassRef.current &&
          locationReadyRef.current &&
          mapRef.current &&
          !fullMapRef.current
        ) {
          setSmoothHeading((prev) => {
            const newHeading = smoothAngle(prev, correctedHeading);

            setLocation((prevLocation) => {
              if (!prevLocation) return prevLocation;

              mapRef.current?.animateCamera(
                {
                  center: {
                    latitude: prevLocation.latitude,
                    longitude: prevLocation.longitude,
                  },
                  heading: newHeading,
                  zoom: 19,
                },
                { duration: 300 },
              );

              return {
                ...prevLocation,
                heading: newHeading,
              };
            });

            return newHeading;
          });
        }
      });

      positionSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 500,
          distanceInterval: 0,
        },
        (locationData) => {
          const rawKmh = Math.max(0, (locationData.coords.speed ?? 0) * 3.6);
          // Threshold: abaixo de 2 km/h e ruido do GPS, tratar como parado
          const kmh = rawKmh < 2 ? 0 : rawKmh;

          setSpeed(kmh);
          speedRef.current = kmh;
          locationReadyRef.current = true;

          // Fator adaptativo: converge mais rapido quando desacelerando forte
          const speedDiff = Math.abs(kmh - smoothSpeed);
          const smoothFactor = speedDiff > 20 ? 0.5 : speedDiff > 5 ? 0.35 : 0.25;
          setSmoothSpeed((prev) => prev + (kmh - prev) * smoothFactor);

          // Armazenar GPS heading para calibracao
          const gpsHeading = locationData.coords.heading;
          if (gpsHeading != null && gpsHeading >= 0) {
            gpsHeadingRef.current = gpsHeading;
          }

          // Auto-calibracao: quando em velocidade suficiente para GPS heading confiavel,
          // medir o delta entre GPS heading e compass heading bruto (sem offset).
          // Isso captura qualquer compensacao (ou falta dela) do Android para landscape.
          if (
            kmh >= CALIBRATION_MIN_SPEED_KMH &&
            gpsHeadingRef.current !== null &&
            compassHeadingRef.current !== null
          ) {
            // Delta = quanto precisamos somar ao compass para igualar ao GPS
            const delta = angleDelta(compassHeadingRef.current, gpsHeadingRef.current);
            const buffer = calibrationBufferRef.current;
            buffer.push(delta);
            if (buffer.length > CALIBRATION_BUFFER_SIZE) {
              buffer.shift();
            }
            if (buffer.length >= CALIBRATION_MIN_SAMPLES) {
              calibratedOffsetRef.current = circularMean(buffer);
              isCalibrated.current = true;
            }
          }

          // Histerese: evita oscilacao entre GPS e compass ao redor do threshold
          if (useCompassRef.current && kmh > 8) {
            useCompassRef.current = false;
          } else if (!useCompassRef.current && kmh < 5) {
            useCompassRef.current = true;
          }

          setLocation((prevLocation) => {
            const prevHeading = prevLocation?.heading ?? 0;

            // Fusao GPS/Compass com histerese e calibracao.
            // Em compass mode, aplica offset calibrado ao compass heading.
            // Em GPS mode, usa GPS heading diretamente (ja e confiavel em movimento).
            let targetHeading: number;
            if (useCompassRef.current && compassHeadingRef.current !== null) {
              targetHeading =
                (compassHeadingRef.current + calibratedOffsetRef.current + 360) % 360;
            } else {
              targetHeading =
                locationData.coords.heading ?? prevHeading;
            }

            const newHeading = smoothAngle(prevHeading, targetHeading);
            setSmoothHeading(newHeading);

            // Camera animada apenas fora do mapa fullscreen
            if (mapRef.current && !fullMapRef.current) {
              const zoom =
                kmh < 20 ? 19 : kmh < 50 ? 18 : kmh < 80 ? 17 : 16;
              mapRef.current.animateCamera(
                {
                  center: {
                    latitude: locationData.coords.latitude,
                    longitude: locationData.coords.longitude,
                  },
                  heading: newHeading,
                  zoom,
                },
                { duration: 400 },
              );
            }

            return {
              latitude: locationData.coords.latitude,
              longitude: locationData.coords.longitude,
              heading: newHeading,
            };
          });
        },
      );
    })();

    return () => {
      headingSubscription?.remove();
      positionSubscription?.remove();
    };
  }, []);

  return { location, speed, smoothSpeed, smoothHeading };
}
