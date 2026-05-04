import {
  BatteryIndicator,
  BrightnessControl,
  Clock,
  FullScreenMap,
  MiniMap,
  SpeedLimitButton,
  SpeedArc,
  SpeedLimitModal,
  Speedometer,
  StartupOverlay,
  ScreenshotButton,
  TripInfo,
} from "@/components";
import {
  useBattery,
  useClock,
  useLocation,
  usePersistedSettings,
  useSpeedLimit,
  useTrip,
} from "@/hooks";
import type { Destination } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import MapView from "react-native-maps";
import Toast from "react-native-toast-message";
import { captureRef } from "react-native-view-shot";

/**
 * Modo simulacao de velocidade.
 * Ativado via variavel de ambiente EXPO_PUBLIC_SIMULATE_SPEED=true
 * (ex: npm run test:speed).
 */
const SIMULATE_SPEED = process.env.EXPO_PUBLIC_SIMULATE_SPEED === "true";

/**
 * Tela principal do VeloMax.
 *
 * Dois modos de exibicao:
 * 1. HUD (padrao): velocimetro, mini-mapa, bateria, relogio, limite de velocidade
 * 2. Mapa fullscreen: navegacao completa com busca e rota
 *
 * Orientacao: landscape right exclusivamente.
 * Uso: veiculo (carro/moto) com celular montado no painel/suporte.
 */
export default function Index() {
  const mapRef = useRef<MapView>(null);
  const hudCaptureRef = useRef<View>(null);

  // --- Hooks customizados ---
  const time = useClock();
  const batteryLevel = useBattery();
  const settings = usePersistedSettings();

  const [fullMap, setFullMap] = useState(false);

  const { location, speed, smoothSpeed, smoothHeading } = useLocation(
    mapRef,
    fullMap,
  );

  const speedLimitHook = useSpeedLimit(
    location,
    settings.speedLimitMode,
    settings.savedSpeedLimit,
    speed,
  );

  const trip = useTrip(location, speed);

  // --- Simulacao de velocidade (debug) ---
  const [simSpeed, setSimSpeed] = useState(0);
  const simDirRef = useRef(1); // 1 = subindo, -1 = descendo

  useEffect(() => {
    if (!SIMULATE_SPEED) return;
    const interval = setInterval(() => {
      setSimSpeed((prev) => {
        const next = prev + simDirRef.current * 2; // +2 km/h por tick
        if (next >= MAX_STARTUP_SPEED) {
          simDirRef.current = -1;
          return MAX_STARTUP_SPEED;
        }
        if (next <= 0) {
          simDirRef.current = 1;
          return 0;
        }
        return next;
      });
    }, 50); // ~40 km/h por segundo
    return () => clearInterval(interval);
  }, []);

  // --- Estado de navegacao ---
  const [destination, setDestination] = useState<Destination | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);

  // --- Estado de UI ---
  const [startupDone, setStartupDone] = useState(false);
  const [speedometerReady, setSpeedometerReady] = useState(false);
  const [showBrightness, setShowBrightness] = useState(false);
  const [showSpeedLimitModal, setShowSpeedLimitModal] = useState(false);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  // --- Animacao de startup do velocimetro (0 → 240 → 0) ---
  const [startupSpeed, setStartupSpeed] = useState(0);
  const startupRunning = useRef(false);
  const MAX_STARTUP_SPEED = 240;

  useEffect(() => {
    if (speedometerReady || startupRunning.current) return;
    startupRunning.current = true;

    const totalUp = 800;
    const totalDown = 400;
    const fps = 60;
    const intervalMs = 1000 / fps;

    // Fase 1: 0 → 240
    let frame = 0;
    const framesUp = Math.round(totalUp / intervalMs);
    const timerUp = setInterval(() => {
      frame++;
      const progress = frame / framesUp;
      const eased = 1 - Math.pow(1 - progress, 2);
      setStartupSpeed(Math.round(eased * MAX_STARTUP_SPEED));

      if (frame >= framesUp) {
        clearInterval(timerUp);

        // Fase 2: 240 → 0
        let frameDown = 0;
        const framesDown = Math.round(totalDown / intervalMs);
        const timerDown = setInterval(() => {
          frameDown++;
          const progressDown = frameDown / framesDown;
          const easedDown = 1 - Math.pow(1 - progressDown, 2);
          setStartupSpeed(Math.round(MAX_STARTUP_SPEED * (1 - easedDown)));

          if (frameDown >= framesDown) {
            clearInterval(timerDown);
            setStartupSpeed(0);
            setSpeedometerReady(true);
          }
        }, intervalMs);
      }
    }, intervalMs);

    return () => {
      clearInterval(timerUp);
    };
  }, [speedometerReady]);

  // Velocidades efetivas: startup > simulacao > GPS real
  const effectiveSpeed = !speedometerReady
    ? startupSpeed
    : SIMULATE_SPEED
      ? simSpeed
      : speed;
  const effectiveSmoothSpeed = !speedometerReady
    ? startupSpeed
    : SIMULATE_SPEED
      ? simSpeed
      : smoothSpeed;

  // Manter tela ativa
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    return () => {
      deactivateKeepAwake();
    };
  }, []);

  // --- Handlers ---
  const handleRouteReady = (distance: number, duration: number) => {
    setRouteDistance(distance);
    setRouteDuration(duration);
  };

  const handleClearRoute = () => {
    setDestination(null);
    setRouteDistance(null);
    setRouteDuration(null);
  };

  const handleMapDestination = (coordinate: Destination) => {
    setDestination(coordinate);
  };

  const handleSetSpeedLimitMode = async (mode: "auto" | "manual") => {
    speedLimitHook.setSpeedLimitMode(mode);
    await AsyncStorage.setItem("speedLimitMode", mode);
  };

  const handleSaveHudScreenshot = async () => {
    try {
      if (!hudCaptureRef.current) {
        Toast.show({
          type: "error",
          text1: "Falha ao capturar",
          text2: "Nao foi possivel acessar o HUD para print.",
        });
        return;
      }

      const permission = mediaPermission?.granted
        ? mediaPermission
        : await requestMediaPermission();

      if (!permission?.granted) {
        Toast.show({
          type: "error",
          text1: "Permissao negada",
          text2: "Permita acesso a fotos para salvar o print.",
        });
        return;
      }

      const localUri = await captureRef(hudCaptureRef, {
        format: "png",
        quality: 1,
      });

      await MediaLibrary.saveToLibraryAsync(localUri);

      Toast.show({
        type: "success",
        text1: "Print salvo",
        text2: "Imagem salva na galeria.",
      });
    } catch {
      Toast.show({
        type: "error",
        text1: "Erro ao salvar print",
        text2: "Tente novamente em alguns segundos.",
      });
    }
  };

  return (
    <>
      {/* Modo Normal - HUD */}
      {!fullMap ? (
        <Pressable onLongPress={settings.handleToggleTheme} className="flex-1">
          <View
            ref={hudCaptureRef}
            collapsable={false}
            className={`flex-1 items-center justify-center px-6 ${
              settings.inverted ? "bg-white" : "bg-panel"
            }`}
          >
            {/* Mini-mapa */}
            {location ? (
              <MiniMap
                mapRef={mapRef}
                location={location}
                smoothHeading={smoothHeading}
                inverted={settings.inverted}
                destination={destination}
                routeDistance={routeDistance}
                routeDuration={routeDuration}
                onRouteReady={handleRouteReady}
                onPress={() => setFullMap(true)}
              />
            ) : null}

            {/* Bateria */}
            {batteryLevel !== null ? (
              <BatteryIndicator
                batteryLevel={batteryLevel}
                inverted={settings.inverted}
              />
            ) : null}

            {/* Relogio */}
            <Clock time={time} inverted={settings.inverted} />

            {/* Botao Limite de Velocidade */}
            <SpeedLimitButton
              speedLimit={speedLimitHook.speedLimit}
              speedLimitMode={speedLimitHook.speedLimitMode}
              speed={effectiveSpeed}
              inverted={settings.inverted}
              flashAnim={speedLimitHook.flashAnim}
              onPress={() => setShowSpeedLimitModal(true)}
            />

            <ScreenshotButton
              inverted={settings.inverted}
              onPress={handleSaveHudScreenshot}
            />

            {/* Modal de Limite de Velocidade */}
            <SpeedLimitModal
              visible={showSpeedLimitModal}
              inverted={settings.inverted}
              speedLimit={speedLimitHook.speedLimit}
              speedLimitMode={speedLimitHook.speedLimitMode}
              autoSpeedLimitRef={speedLimitHook.autoSpeedLimitRef}
              onClose={() => setShowSpeedLimitModal(false)}
              onSetSpeedLimit={speedLimitHook.setSpeedLimit}
              onSetSpeedLimitMode={handleSetSpeedLimitMode}
              onSetAutoSpeedLimit={speedLimitHook.setAutoSpeedLimit}
            />

            {/* Controle de Brilho */}
            <BrightnessControl
              brightness={settings.brightness}
              inverted={settings.inverted}
              showBrightness={showBrightness}
              onToggle={() => setShowBrightness(!showBrightness)}
              onBrightnessChange={settings.handleBrightnessChange}
            />

            {/* Barra de velocidade curvada (posicao fixa, perto do mapa) */}
            <View className="absolute left-[470px] top-0 bottom-10 justify-center">
              <SpeedArc
                speed={effectiveSmoothSpeed}
                inverted={settings.inverted}
              />
            </View>

            {/* Velocimetro */}
            <View className="absolute right-28 items-center justify-center">
              <Speedometer
                speed={effectiveSpeed}
                smoothSpeed={effectiveSmoothSpeed}
                inverted={settings.inverted}
                speedLimit={speedLimitHook.speedLimit}
              />
            </View>

            {/* Trip Info (abaixo do mini-mapa, alinhado com borda inferior) */}
            <View className="absolute top-[337px] right-[34px]">
              <TripInfo
                activeTrip={trip.activeTrip}
                tripDistance={trip.tripDistance}
                avgSpeed={trip.avgSpeed}
                inverted={settings.inverted}
                onToggleTrip={trip.toggleTrip}
                onResetDistance={trip.resetDistance}
                onResetAvgSpeed={trip.resetAvgSpeed}
              />
            </View>
          </View>
        </Pressable>
      ) : /* Modo Mapa Fullscreen */
      location ? (
        <FullScreenMap
          mapRef={mapRef}
          location={location}
          smoothHeading={smoothHeading}
          inverted={settings.inverted}
          vehicleMode={settings.vehicleMode}
          destination={destination}
          routeDistance={routeDistance}
          routeDuration={routeDuration}
          onClose={() => setFullMap(false)}
          onMapPress={handleMapDestination}
          onRouteReady={handleRouteReady}
          onClearRoute={handleClearRoute}
          onVehicleMode={settings.handleVehicleMode}
        />
      ) : null}

      {/* Animacao de startup CRT */}
      {!startupDone ? (
        <StartupOverlay onComplete={() => setStartupDone(true)} />
      ) : null}

      {/* Toast global para notificacoes (rate limit, etc) */}
      <Toast position="bottom" bottomOffset={20} />
    </>
  );
}
