import { Speedometer } from "@/components/Speedometer";
import { AntDesign, FontAwesome, FontAwesome6 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import * as Battery from "expo-battery";
import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";

function smoothAngle(current: number, target: number) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * 0.15 + 360) % 360;
}

const GOOGLE_MAPS_KEY = "AIzaSyD8l0IZqrWKXn5KQP1B_RPX8CjRuohd6sY";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
];

export default function Index() {
  const mapRef = useRef<MapView>(null);
  const fullMapRef = useRef(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [speed, setSpeed] = useState(0);
  const [smoothSpeed, setSmoothSpeed] = useState(0);
  const [time, setTime] = useState("");
  const [inverted, setInverted] = useState(false);
  const [showBrightness, setShowBrightness] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  // Estados para navegação
  const [fullMap, setFullMap] = useState(false);

  useEffect(() => {
    fullMapRef.current = fullMap;
  }, [fullMap]);
  const [destination, setDestination] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);

  // Estados para busca de endereço
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { place_id: string; description: string }[]
  >([]);
  const [showSearch, setShowSearch] = useState(false);

  // Estado para tipo de veículo
  const [vehicleMode, setVehicleMode] = useState<"car" | "motorcycle">("car");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

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
      const savedVehicle = await AsyncStorage.getItem("vehicleMode");

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

      if (savedVehicle === "car" || savedVehicle === "motorcycle") {
        setVehicleMode(savedVehicle);
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

            // Camera animada apenas fora do mapa fullscreen
            if (mapRef.current && !fullMapRef.current) {
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
    setShowVehicleDropdown(false);
  };

  const handleMapPress = (e: any) => {
    if (showVehicleDropdown) {
      setShowVehicleDropdown(false);
      return;
    }
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

  const searchAddress = async (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.length < 3) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const locationBias = location
          ? `&location=${location.latitude},${location.longitude}&radius=100000`
          : "";
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_KEY}&language=pt-BR&types=geocode|establishment${locationBias}`,
        );
        const data = await res.json();
        if (data.predictions) {
          setSearchResults(
            data.predictions.map((p: any) => ({
              place_id: p.place_id,
              description: p.description,
            })),
          );
        }
      } catch (e) {
        console.error("Erro na busca:", e);
      }
    }, 400);
  };

  const selectPlace = async (placeId: string) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_KEY}`,
      );
      const data = await res.json();
      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        setDestination({ latitude: lat, longitude: lng });
        setSearchQuery("");
        setSearchResults([]);
        setShowSearch(false);
        mapRef.current?.animateCamera(
          { center: { latitude: lat, longitude: lng }, zoom: 15 },
          { duration: 800 },
        );
      }
    } catch (e) {
      console.error("Erro ao obter detalhes do lugar:", e);
    }
  };

  const handleVehicleMode = async (mode: "car" | "motorcycle") => {
    setVehicleMode(mode);
    setShowVehicleDropdown(false);
    await AsyncStorage.setItem("vehicleMode", mode);
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
                    customMapStyle={inverted ? [] : DARK_MAP_STYLE}
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
                        color={inverted ? "black" : "white"}
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
                    className={`rounded-2xl p-8 mx-8 items-center ${inverted ? "bg-white" : "bg-gray-900"}`}
                    style={{ minWidth: 300 }}
                  >
                    <Text
                      className={`text-2xl font-bold mb-6 ${inverted ? "text-black" : "text-white"}`}
                    >
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
                              : inverted
                                ? "border-gray-300 bg-gray-100"
                                : "border-gray-600 bg-gray-800"
                          }`}
                        >
                          <Text
                            className={`text-xl font-bold ${
                              speedLimit === v
                                ? "text-cyan-400"
                                : inverted
                                  ? "text-black"
                                  : "text-white"
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
              customMapStyle={inverted ? [] : DARK_MAP_STYLE}
              rotateEnabled={true}
              scrollEnabled={true}
              zoomEnabled={true}
              pitchEnabled={false}
              showsCompass={true}
              showsMyLocationButton={false}
              showsUserLocation={true}
              showsTraffic={true}
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
                  }}
                />
              )}
            </MapView>
          ) : null}

          {/* Controles do mapa fullscreen */}
          <View className="absolute top-10 left-6 right-6">
            {/* Barra superior */}
            <View className="flex-row justify-between items-center">
              {/* Botão Fechar */}
              <Pressable
                onPress={() => {
                  closeFullMap();
                  setShowSearch(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className={`px-6 py-3 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
              >
                <Text
                  className={`text-xl font-bold ${inverted ? "text-black" : "text-white"}`}
                >
                  ✕ Fechar
                </Text>
              </Pressable>

              {/* Botões direita */}
              <View className="flex-row gap-2 items-center">
                {/* Info da rota */}
                {destination && routeDistance && routeDuration ? (
                  <View
                    className={`px-4 py-2 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
                  >
                    <Text className="text-cyan-400 text-lg font-bold">
                      ETA: {formatETA(routeDuration)}
                    </Text>
                    <Text
                      className={`text-base ${inverted ? "text-gray-600" : "text-gray-300"}`}
                    >
                      {formatDistance(routeDistance)}
                    </Text>
                  </View>
                ) : null}

                {/* Botão Tipo de Veículo */}
                <View style={{ position: "relative" }}>
                  <Pressable
                    onPress={() => setShowVehicleDropdown(!showVehicleDropdown)}
                    className={`px-4 py-3 rounded-lg ${
                      showVehicleDropdown
                        ? "bg-cyan-600/90"
                        : inverted
                          ? "bg-white/90"
                          : "bg-gray-800/90"
                    }`}
                  >
                    {vehicleMode === "car" ? (
                      <AntDesign
                        name="car"
                        size={24}
                        color={
                          showVehicleDropdown
                            ? "white"
                            : inverted
                              ? "black"
                              : "white"
                        }
                      />
                    ) : (
                      <FontAwesome6
                        name="motorcycle"
                        size={24}
                        color={
                          showVehicleDropdown
                            ? "white"
                            : inverted
                              ? "black"
                              : "white"
                        }
                      />
                    )}
                  </Pressable>

                  {showVehicleDropdown && (
                    <View
                      className={`absolute rounded-xl overflow-hidden ${
                        inverted
                          ? "bg-white border border-gray-300"
                          : "bg-gray-800"
                      }`}
                      style={{
                        top: 56,
                        right: 0,
                        minWidth: 140,
                        zIndex: 1000,
                        elevation: 10,
                      }}
                    >
                      <Pressable
                        onPress={() => handleVehicleMode("car")}
                        className={`px-5 py-3 flex-row items-center gap-3 ${
                          vehicleMode === "car" ? "bg-cyan-500/20" : ""
                        }`}
                      >
                        <AntDesign
                          name="car"
                          size={22}
                          color={
                            vehicleMode === "car"
                              ? "#22d3ee"
                              : inverted
                                ? "black"
                                : "white"
                          }
                        />
                        <Text
                          className={`text-base font-semibold ${
                            vehicleMode === "car"
                              ? "text-cyan-400"
                              : inverted
                                ? "text-black"
                                : "text-white"
                          }`}
                        >
                          Carro
                        </Text>
                      </Pressable>

                      <View
                        className={`h-px ${
                          inverted ? "bg-gray-200" : "bg-gray-700"
                        }`}
                      />

                      <Pressable
                        onPress={() => handleVehicleMode("motorcycle")}
                        className={`px-5 py-3 flex-row items-center gap-3 ${
                          vehicleMode === "motorcycle" ? "bg-cyan-500/20" : ""
                        }`}
                      >
                        <FontAwesome6
                          name="motorcycle"
                          size={22}
                          color={
                            vehicleMode === "motorcycle"
                              ? "#22d3ee"
                              : inverted
                                ? "black"
                                : "white"
                          }
                        />
                        <Text
                          className={`text-base font-semibold ${
                            vehicleMode === "motorcycle"
                              ? "text-cyan-400"
                              : inverted
                                ? "text-black"
                                : "text-white"
                          }`}
                        >
                          Moto
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Botão Busca */}
                <Pressable
                  onPress={() => {
                    setShowSearch(!showSearch);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className={`px-4 py-3 rounded-lg ${
                    showSearch
                      ? "bg-cyan-600/90"
                      : inverted
                        ? "bg-white/90"
                        : "bg-gray-800/90"
                  }`}
                >
                  <Text
                    className={`text-xl ${inverted && !showSearch ? "text-black" : "text-white"}`}
                  >
                    🔍
                  </Text>
                </Pressable>

                {/* Botão Retornar ao local atual */}
                <Pressable
                  onPress={() => {
                    if (mapRef.current && location) {
                      mapRef.current.animateCamera(
                        {
                          center: {
                            latitude: location.latitude,
                            longitude: location.longitude,
                          },
                          heading: smoothHeading,
                          zoom: 17,
                        },
                        { duration: 600 },
                      );
                    }
                  }}
                  className={`px-4 py-3 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
                >
                  <Text
                    className={`text-xl ${inverted ? "text-black" : "text-white"}`}
                  >
                    📍
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Painel de busca */}
            {showSearch && (
              <View className="mt-3">
                <TextInput
                  className={`px-4 py-3 rounded-xl text-lg ${inverted ? "bg-white text-black border border-gray-300" : "bg-gray-800 text-white"}`}
                  placeholder="Buscar endereço..."
                  placeholderTextColor={inverted ? "#6b7280" : "#9ca3af"}
                  value={searchQuery}
                  onChangeText={searchAddress}
                  autoFocus
                  returnKeyType="search"
                />
                {searchResults.length > 0 && (
                  <ScrollView
                    className={`mt-1 rounded-xl ${inverted ? "bg-white border border-gray-300" : "bg-gray-800"}`}
                    style={{ maxHeight: 260 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {searchResults.map((result, index) => (
                      <Pressable
                        key={result.place_id}
                        onPress={() => selectPlace(result.place_id)}
                        className={`px-4 py-3 ${
                          index < searchResults.length - 1
                            ? `border-b ${inverted ? "border-gray-200" : "border-gray-700"}`
                            : ""
                        }`}
                      >
                        <Text
                          className={`text-base ${inverted ? "text-black" : "text-white"}`}
                          numberOfLines={2}
                        >
                          {result.description}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>

          {/* Instruções / Botão Limpar */}
          <View className="absolute bottom-10 left-6 right-6 items-center">
            {!destination ? (
              <View
                className={`px-6 py-3 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
              >
                <Text
                  className={`text-lg ${inverted ? "text-black" : "text-white"}`}
                >
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
