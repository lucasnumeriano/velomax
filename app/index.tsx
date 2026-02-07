import { Speedometer } from "@/components/Speedometer";
import { AntDesign } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import * as Battery from "expo-battery";
import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import MapView from "react-native-maps";

function smoothAngle(current: number, target: number) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * 0.15 + 360) % 360;
}

export default function Index() {
  const mapRef = useRef<MapView>(null);
  const [speed, setSpeed] = useState(0);
  const [smoothSpeed, setSmoothSpeed] = useState(0);
  const [time, setTime] = useState("");
  const [inverted, setInverted] = useState(false);
  const [showBrightness, setShowBrightness] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

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

  return (
    <Pressable onLongPress={handleToggleTheme} className="flex-1">
      <View
        className={`flex-1 items-center justify-center px-6 ${
          inverted ? "bg-white" : "bg-panel"
        }`}
      >
        {location ? (
          <View
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
              />
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
          </View>
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
            <Text className={`mb-2 ${inverted ? "text-black" : "text-white"}`}>
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
  );
}
