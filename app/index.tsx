import {
  BatteryIndicator,
  BrightnessControl,
  Clock,
  FullScreenMap,
  MiniMap,
  SpeedLimitButton,
  SpeedLimitModal,
  Speedometer,
  StartupOverlay,
} from "@/components";
import {
  useBattery,
  useClock,
  useLocation,
  usePersistedSettings,
  useSpeedLimit,
} from "@/hooks";
import type { Destination } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import MapView from "react-native-maps";
import Toast from "react-native-toast-message";

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

  // --- Estado de navegacao ---
  const [destination, setDestination] = useState<Destination | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);

  // --- Estado de UI ---
  const [startupDone, setStartupDone] = useState(false);
  const [speedometerReady, setSpeedometerReady] = useState(false);
  const [showBrightness, setShowBrightness] = useState(false);
  const [showSpeedLimitModal, setShowSpeedLimitModal] = useState(false);

  // Manter tela ativa
  useEffect(() => {
    activateKeepAwakeAsync();
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

  return (
    <>
      {/* Modo Normal - HUD */}
      {!fullMap ? (
        <Pressable onLongPress={settings.handleToggleTheme} className="flex-1">
          <View
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
              speed={speed}
              inverted={settings.inverted}
              flashAnim={speedLimitHook.flashAnim}
              onPress={() => setShowSpeedLimitModal(true)}
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

            {/* Velocimetro */}
            <View className="absolute right-44">
              <Speedometer
                speed={speed}
                smoothSpeed={smoothSpeed}
                inverted={settings.inverted}
                speedLimit={speedLimitHook.speedLimit}
                startupDone={speedometerReady}
                onStartupComplete={() => setSpeedometerReady(true)}
              />
            </View>
          </View>
        </Pressable>
      ) : (
        /* Modo Mapa Fullscreen */
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
        ) : null
      )}

      {/* Animacao de startup CRT */}
      {!startupDone ? (
        <StartupOverlay onComplete={() => setStartupDone(true)} />
      ) : null}

      {/* Toast global para notificacoes (rate limit, etc) */}
      <Toast position="bottom" bottomOffset={20} />
    </>
  );
}
