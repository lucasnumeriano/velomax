import { Speedometer } from "@/components/Speedometer";
import { AntDesign } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import * as Battery from "expo-battery";
import * as Brightness from "expo-brightness";
import Constants from "expo-constants";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";

function smoothAngle(current: number, target: number) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * 0.15 + 360) % 360;
}

const GOOGLE_MAPS_KEY = Constants.expoConfig?.extra?.googleMapsApiKey;
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
                style={{ width: 150, height: 150 }}
              >
                {/* Borda externa estilo radar */}
                <View
                  className="absolute border border-gray-600"
                  style={{
                    width: 150,
                    height: 150,
                    borderRadius: 75,
                  }}
                />

                {/* Mapa circular */}
                <View
                  className="bg-black overflow-hidden"
                  style={{
                    width: 130,
                    height: 130,
                    borderRadius: 65,
                  }}
                >
                  <MapView
                    ref={mapRef}
                    style={{ width: 130, height: 130 }}
                    initialCamera={{
                      center: {
                        latitude: location.latitude,
                        longitude: location.longitude,
                      },
                      heading: 0,
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
                    showsTraffic={false}
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
                      borderLeftWidth: 8,
                      borderRightWidth: 8,
                      borderBottomWidth: 16,
                      borderLeftColor: "transparent",
                      borderRightColor: "transparent",
                      borderBottomColor: "#00c8ff",
                    }}
                  />
                </View>
              </Pressable>
            ) : null}

            {/* Battery */}
            {batteryLevel !== null ? (
              <View className="absolute bottom-10 right-12 flex-row items-center gap-2">
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
            <View className="absolute top-10 right-12">
              <Text
                className={`text-3xl tracking-widest ${
                  inverted ? "text-black" : "text-gray-300"
                }`}
              >
                {time}
              </Text>
            </View>

            {/* ETA e Distância (quando há rota ativa) */}
            {destination && routeDistance && routeDuration ? (
              <View className="absolute top-24 right-12">
                <View
                  className={`px-4 py-2 rounded-lg ${
                    inverted ? "bg-gray-200" : "bg-gray-800"
                  }`}
                >
                  <Text
                    className={`text-xl font-bold ${
                      inverted ? "text-black" : "text-cyan-400"
                    }`}
                  >
                    ETA: {formatETA(routeDuration)}
                  </Text>
                  <Text
                    className={`text-lg ${
                      inverted ? "text-gray-700" : "text-gray-300"
                    }`}
                  >
                    {formatDistance(routeDistance)}
                  </Text>
                </View>
              </View>
            ) : null}

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
            <Speedometer
              speed={speed}
              smoothSpeed={smoothSpeed}
              inverted={inverted}
            />
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
