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

        // Compensar landscape direito: sensor reporta eixo portrait (topo do telefone),
        // em landscape direito o topo aponta pra esquerda, +90 alinha com a frente do veiculo
        const heading = (headingData.trueHeading + 90) % 360;
        compassHeadingRef.current = heading;

        // Quando parado/lento, atualizar mapa direto pelo compass
        // Só anima se já recebeu pelo menos uma localização GPS (MapView montado)
        if (
          speedRef.current < 5 &&
          locationReadyRef.current &&
          mapRef.current &&
          !fullMapRef.current
        ) {
          setSmoothHeading((prev) => {
            const newHeading = smoothAngle(prev, heading);

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
          const kmh = Math.max(0, (locationData.coords.speed ?? 0) * 3.6);

          setSpeed(kmh);
          speedRef.current = kmh;
          locationReadyRef.current = true;

          setSmoothSpeed((prev) => prev + (kmh - prev) * 0.2);

          setLocation((prevLocation) => {
            const prevHeading = prevLocation?.heading ?? 0;

            // Fusao GPS/Compass: usar compass quando lento, GPS quando em movimento.
            // Quando em movimento, NAO usar compass como fallback — evita
            // contaminacao por magHeading com offset de declinacao magnetica.
            let targetHeading: number;
            if (kmh < 5 && compassHeadingRef.current !== null) {
              targetHeading = compassHeadingRef.current;
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
