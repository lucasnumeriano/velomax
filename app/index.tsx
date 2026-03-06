import { Speedometer } from "@/components/Speedometer";
import { AntDesign, FontAwesome } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import * as Battery from "expo-battery";
import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";

function smoothAngle(current: number, target: number) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * 0.15 + 360) % 360;
}

const GOOGLE_MAPS_KEY = "AIzaSyD8l0IZqrWKXn5KQP1B_RPX8CjRuohd6sY";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function Index() {
  const mapRef = useRef<MapView>(null);
  const [speed, setSpeed] = useState(0);
  const [smoothSpeed, setSmoothSpeed] = useState(0);
  const [time, setTime] = useState("");
  const [inverted, setInverted] = useState(false);
  const [showBrightness, setShowBrightness] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  // Estados para navegação
  const [fullMap, setFullMap] = useState(false);
  const [destination, setDestination] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);

  // Estado para limite de velocidade
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [showSpeedLimitModal, setShowSpeedLimitModal] = useState(false);

  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    heading: number;
  } | null>(null);
  const [smoothHeading, setSmoothHeading] = useState(0);

  useEffect(() => {
    // Ativar keep awake para manter a tela sempre ativa
    activateKeepAwakeAsync();

    const clock = setInterval(() => {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, "0");
      const m = now.getMinutes().toString().padStart(2, "0");
      setTime(`${h}:${m}`);
    }, 1000);

    let batterySubscription: ReturnType<
      typeof Battery.addBatteryLevelListener
    > | null = null;

    (async () => {
      // Carregar preferências salvas
      const savedTheme = await AsyncStorage.getItem("theme");
      const savedBrightness = await AsyncStorage.getItem("brightness");
      const savedSpeedLimit = await AsyncStorage.getItem("speedLimit");

      if (savedTheme !== null) {
        setInverted(savedTheme === "inverted");
      }

      if (savedBrightness !== null) {
        const brightnessValue = parseFloat(savedBrightness);
        setBrightness(brightnessValue);
        await Brightness.setBrightnessAsync(brightnessValue);
      } else {
        // Obter brilho atual se não houver valor salvo
        const currentBrightness = await Brightness.getBrightnessAsync();
        setBrightness(currentBrightness);
      }

      if (savedSpeedLimit !== null) {
        setSpeedLimit(parseInt(savedSpeedLimit, 10));
      }

      // Obter nível da bateria inicial
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (locationData) => {
          const kmh = Math.max(0, (locationData.coords.speed ?? 0) * 3.6);

          setSpeed(kmh);

          setSmoothSpeed((prev) => {
            return prev + (kmh - prev) * 0.2;
          });

          setLocation((prevLocation) => {
            // Heading suavizado sempre
            const prevHeading = prevLocation?.heading ?? smoothHeading;
            const heading = locationData.coords.heading ?? prevHeading;

            const newHeading = smoothAngle(prevHeading, heading);
            setSmoothHeading(newHeading);

            // Camera animada sempre
            if (mapRef.current) {
              const zoom = kmh < 20 ? 19 : kmh < 50 ? 18 : kmh < 80 ? 17 : 16;
              mapRef.current.animateCamera(
                {
                  center: {
                    latitude: locationData.coords.latitude,
                    longitude: locationData.coords.longitude,
                  },
                  heading: newHeading,
                  zoom,
                },
                { duration: 600 },
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

      // Monitorar mudanças no nível da bateria
      batterySubscription = Battery.addBatteryLevelListener(
        ({ batteryLevel }) => {
          setBatteryLevel(batteryLevel);
        },
      );
    })();

    return () => {
      clearInterval(clock);
      deactivateKeepAwake();
      batterySubscription?.remove();
    };
  }, []);

  const handleBrightnessChange = async (value: number) => {
    setBrightness(value);
    await Brightness.setBrightnessAsync(value);
    await AsyncStorage.setItem("brightness", value.toString());
  };

  const handleToggleTheme = async () => {
    const newInverted = !inverted;
    setInverted(newInverted);
    await AsyncStorage.setItem("theme", newInverted ? "inverted" : "normal");
  };

  const openFullMap = () => {
    setFullMap(true);
  };

  const closeFullMap = () => {
    setFullMap(false);
  };

  const handleMapPress = (e: any) => {
    if (fullMap) {
      setDestination(e.nativeEvent.coordinate);
    }
  };

  const clearRoute = () => {
    setDestination(null);
    setRouteDistance(null);
    setRouteDuration(null);
  };

  const formatETA = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  return (
    <>
      {/* Modo Normal - HUD */}
      {!fullMap ? (
        <Pressable onLongPress={handleToggleTheme} className="flex-1">
          <View
            className={`flex-1 items-center justify-center px-6 ${
              inverted ? "bg-white" : "bg-panel"
            }`}
          >
            {location ? (
              <Pressable
                onPress={openFullMap}
                className="absolute top-6 left-6 items-center justify-center"
                style={{ width: 440, height: 340 }}
              >
                {/* Borda externa estilo radar */}
                <View
                  className="absolute"
                  style={{
                    width: 440,
                    height: 340,
                    borderRadius: 8,
                  }}
                />

                {/* Mapa quadrado */}
                <View
                  className="bg-black overflow-hidden"
                  style={{
                    width: 420,
                    height: 320,
                    borderRadius: 6,
                  }}
                >
                  <MapView
                    ref={mapRef}
                    style={{ width: 420, height: 320 }}
                    initialCamera={{
                      center: {
                        latitude: location.latitude,
                        longitude: location.longitude,
                      },
                      heading: smoothHeading,
                      pitch: 0,
                      zoom: 18,
                      altitude: 0,
                    }}
                    rotateEnabled={true}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    showsCompass={false}
                    showsBuildings={false}
                    showsTraffic={true}
                  >
                    {/* Rota no minimap */}
                    {destination && GOOGLE_MAPS_KEY && (
                      <MapViewDirections
                        origin={{
                          latitude: location.latitude,
                          longitude: location.longitude,
                        }}
                        destination={destination}
                        apikey={GOOGLE_MAPS_KEY}
                        strokeWidth={3}
                        strokeColor="#00c8ff"
                        optimizeWaypoints
                        onReady={(result) => {
                          setRouteDistance(result.distance * 1000); // km para metros
                          setRouteDuration(result.duration); // minutos
                        }}
                      />
                    )}
                  </MapView>
                </View>

                {/* Player fixo (seta) */}
                <View className="absolute">
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 16,
                      borderRightWidth: 16,
                      borderBottomWidth: 32,
                      borderLeftColor: "transparent",
                      borderRightColor: "transparent",
                      borderBottomColor: "#00c8ff",
                    }}
                  />
                </View>

                {/* Info da rota no minimap */}
                {destination && routeDistance && routeDuration ? (
                  <View className="absolute top-2 right-2">
                    <View
                      className={`px-2 py-1 rounded flex-row  items-center gap-5 ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
                      style={{ minWidth: 90 }}
                    >
                      <FontAwesome
                        name="flag-checkered"
                        size={32}
                        color="white"
                      />
                      <View>
                        <Text
                          className={`text-xl font-bold ${inverted ? "text-black" : "text-cyan-400"}`}
                        >
                          {formatETA(routeDuration)}
                        </Text>
                        <Text
                          className={`text-xl ${inverted ? "text-gray-700" : "text-gray-300"}`}
                        >
                          {formatDistance(routeDistance)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            {/* Battery */}
            {batteryLevel !== null ? (
              <View className="absolute bottom-11 left-28 flex-row items-center gap-2">
                {/* Corpo da bateria */}
                <View
                  className={`border-2 ${
                    inverted ? "border-black" : "border-gray-300"
                  } rounded`}
                  style={{ width: 50, height: 24, padding: 2 }}
                >
                  {/* Barra de preenchimento */}
                  <View
                    style={{
                      width: `${batteryLevel * 100}%`,
                      height: "100%",
                      backgroundColor:
                        batteryLevel > 0.5
                          ? "#00c8ff"
                          : batteryLevel > 0.2
                            ? "#ffa500"
                            : "#ff4444",
                      borderRadius: 1,
                    }}
                  />
                </View>
                {/* Ponta da bateria */}
                <View
                  className={inverted ? "bg-black" : "bg-gray-300"}
                  style={{ width: 3, height: 12, borderRadius: 1 }}
                />
                {/* Porcentagem */}
                <Text
                  className={`text-lg ${inverted ? "text-black" : "text-gray-300"}`}
                >
                  {Math.round(batteryLevel * 100)}%
                </Text>
              </View>
            ) : null}

            {/* Time */}
            <View className="absolute bottom-10 left-[385px]">
              <Text
                className={`text-3xl tracking-widest ${
                  inverted ? "text-black" : "text-gray-300"
                }`}
              >
                {time}
              </Text>
            </View>

            {/* Botão Limite de Velocidade */}
            <Pressable
              onPress={() => setShowSpeedLimitModal(true)}
              className="absolute top-10 right-12"
            >
              <View
                className={`px-3 py-2 rounded-lg border-2 items-center ${
                  speedLimit
                    ? speed > speedLimit
                      ? "border-red-500 bg-red-500/20"
                      : "border-cyan-400 bg-cyan-400/20"
                    : inverted
                      ? "border-gray-400 bg-gray-200"
                      : "border-gray-500 bg-gray-800"
                }`}
              >
                <Text
                  className={`text-xs ${
                    speedLimit
                      ? speed > speedLimit
                        ? "text-red-400"
                        : "text-cyan-400"
                      : inverted
                        ? "text-gray-600"
                        : "text-gray-400"
                  }`}
                >
                  MAX
                </Text>
                <Text
                  className={`text-2xl font-bold ${
                    speedLimit
                      ? speed > speedLimit
                        ? "text-red-400"
                        : "text-cyan-400"
                      : inverted
                        ? "text-black"
                        : "text-white"
                  }`}
                >
                  {speedLimit ?? "--"}
                </Text>
              </View>
            </Pressable>

            {/* Modal de Limite de Velocidade */}
            <Modal
              visible={showSpeedLimitModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowSpeedLimitModal(false)}
            >
              <Pressable
                className="flex-1 items-center justify-center bg-black/60"
                onPress={() => setShowSpeedLimitModal(false)}
              >
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View
                    className="bg-gray-900 rounded-2xl p-8 mx-8 items-center"
                    style={{ minWidth: 300 }}
                  >
                    <Text className="text-white text-2xl font-bold mb-6">
                      Limite de Velocidade
                    </Text>

                    {/* Presets */}
                    <View className="flex-row flex-wrap justify-center gap-3 mb-6">
                      {[30, 40, 50, 60, 80, 100, 120].map((v) => (
                        <Pressable
                          key={v}
                          onPress={async () => {
                            setSpeedLimit(v);
                            await AsyncStorage.setItem(
                              "speedLimit",
                              v.toString(),
                            );
                            setShowSpeedLimitModal(false);
                          }}
                          className={`px-4 py-2 rounded-lg border ${
                            speedLimit === v
                              ? "border-cyan-400 bg-cyan-400/20"
                              : "border-gray-600 bg-gray-800"
                          }`}
                        >
                          <Text
                            className={`text-xl font-bold ${
                              speedLimit === v ? "text-cyan-400" : "text-white"
                            }`}
                          >
                            {v}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Desativar */}
                    <Pressable
                      onPress={async () => {
                        setSpeedLimit(null);
                        await AsyncStorage.removeItem("speedLimit");
                        setShowSpeedLimitModal(false);
                      }}
                      className="border border-red-500 bg-red-500/20 px-6 py-3 rounded-lg"
                    >
                      <Text className="text-red-400 text-lg font-bold">
                        Desativar
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Brightness Control */}
            <Pressable
              onPress={() => setShowBrightness(!showBrightness)}
              className="absolute bottom-10 left-12"
            >
              <AntDesign
                name="sun"
                size={32}
                color={inverted ? "black" : "white"}
              />
            </Pressable>

            {showBrightness ? (
              <View
                className={`absolute bottom-20 left-12 p-4 rounded-lg ${
                  inverted ? "bg-gray-200" : "bg-gray-800"
                }`}
                style={{ width: 200 }}
              >
                <Text
                  className={`mb-2 ${inverted ? "text-black" : "text-white"}`}
                >
                  Brilho: {Math.round(brightness * 100)}%
                </Text>
                <Slider
                  style={{ width: "100%", height: 40 }}
                  minimumValue={0}
                  maximumValue={1}
                  value={brightness}
                  onValueChange={handleBrightnessChange}
                  minimumTrackTintColor="#00c8ff"
                  maximumTrackTintColor={inverted ? "#999" : "#333"}
                  thumbTintColor="#00c8ff"
                />
              </View>
            ) : null}

            {/* Speed */}
            <View className="absolute right-44">
              <Speedometer
                speed={speed}
                smoothSpeed={smoothSpeed}
                inverted={inverted}
                speedLimit={speedLimit}
              />
            </View>
          </View>
        </Pressable>
      ) : (
        /* Modo Mapa Fullscreen */
        <View className="flex-1">
          {location ? (
            <MapView
              ref={mapRef}
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
              initialCamera={{
                center: {
                  latitude: location.latitude,
                  longitude: location.longitude,
                },
                heading: smoothHeading,
                pitch: 0,
                zoom: 15,
                altitude: 0,
              }}
              onPress={handleMapPress}
              rotateEnabled={true}
              scrollEnabled={true}
              zoomEnabled={true}
              pitchEnabled={false}
              showsCompass={true}
              showsMyLocationButton={false}
              showsUserLocation={true}
            >
              {/* Marcador de destino */}
              {destination && (
                <Marker
                  coordinate={destination}
                  pinColor="#00c8ff"
                  title="Destino"
                />
              )}

              {/* Rota */}
              {destination && GOOGLE_MAPS_KEY && (
                <MapViewDirections
                  origin={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                  destination={destination}
                  apikey={GOOGLE_MAPS_KEY}
                  strokeWidth={4}
                  strokeColor="#00c8ff"
                  optimizeWaypoints
                  onReady={(result) => {
                    setRouteDistance(result.distance * 1000); // km para metros
                    setRouteDuration(result.duration); // minutos

                    // Ajustar câmera para mostrar toda a rota
                    mapRef.current?.fitToCoordinates(result.coordinates, {
                      edgePadding: {
                        top: 50,
                        right: 50,
                        bottom: 50,
                        left: 50,
                      },
                      animated: true,
                    });
                  }}
                />
              )}
            </MapView>
          ) : null}

          {/* Controles do mapa fullscreen */}
          <View className="absolute top-10 left-6 right-6 flex-row justify-between items-center">
            {/* Botão Fechar */}
            <Pressable
              onPress={closeFullMap}
              className="bg-gray-800/90 px-6 py-3 rounded-lg"
            >
              <Text className="text-white text-xl font-bold">✕ Fechar</Text>
            </Pressable>

            {/* Info da rota (se existir) */}
            {destination && routeDistance && routeDuration ? (
              <View className="bg-gray-800/90 px-4 py-2 rounded-lg">
                <Text className="text-cyan-400 text-lg font-bold">
                  ETA: {formatETA(routeDuration)}
                </Text>
                <Text className="text-gray-300 text-base">
                  {formatDistance(routeDistance)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Instruções / Botão Limpar */}
          <View className="absolute bottom-10 left-6 right-6 items-center">
            {!destination ? (
              <View className="bg-gray-800/90 px-6 py-3 rounded-lg">
                <Text className="text-white text-lg">
                  📍 Toque no mapa para marcar destino
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={clearRoute}
                className="bg-red-600/90 px-6 py-3 rounded-lg"
              >
                <Text className="text-white text-lg font-bold">
                  🗑️ Limpar Rota
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </>
  );
}
