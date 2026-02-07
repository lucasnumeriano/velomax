import { Speedometer } from "@/components/Speedometer";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import MapView from "react-native-maps";

function smoothAngle(current: number, target: number) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * 0.15 + 360) % 360;
}

export default function Index() {
  const [speed, setSpeed] = useState(0);
  const [time, setTime] = useState("");

  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    heading: number;
  } | null>(null);
  const [smoothHeading, setSmoothHeading] = useState(0);

  useEffect(() => {
    const clock = setInterval(() => {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, "0");
      const m = now.getMinutes().toString().padStart(2, "0");
      setTime(`${h}:${m}`);
    }, 1000);

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (locationData) => {
          const kmh = (locationData.coords.speed ?? 0) * 3.6;
          setSpeed(kmh);

          const heading = locationData.coords.heading ?? smoothHeading;

          setSmoothHeading((prev) => smoothAngle(prev, heading));

          const newPos = {
            latitude: locationData.coords.latitude,
            longitude: locationData.coords.longitude,
            heading,
          };

          setLocation(newPos);
        },
      );
    })();

    return () => clearInterval(clock);
  }, []);

  const zoom = speed < 20 ? 19 : speed < 50 ? 18 : speed < 80 ? 17 : 16;

  return (
    <View className="flex-1 bg-panel items-center justify-center px-6">
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
              style={{ width: 130, height: 130 }}
              camera={{
                center: {
                  latitude: location.latitude,
                  longitude: location.longitude,
                },
                heading: smoothHeading, // 🧠 SUAVIZADO
                pitch: 0,
                zoom,
                altitude: 0,
              }}
              rotateEnabled={false}
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

      {/* Time */}
      <View className="absolute top-10 right-12">
        <Text className="text-gray-300 text-3xl tracking-widest">{time}</Text>
      </View>

      {/* Speed */}
      {/* <View className="items-center gap-2">
        <View className="relative items-center">
          <View
            className="absolute w-96 h-10 rounded-full"
            style={{
              backgroundColor: "rgba(0, 200, 255, 0.9)",
              bottom: 0,
              filter: "blur(40px)",
            }}
          />
          <Text className="text-white text-[160px] font-semibold leading-none">
            {speed.toFixed(0)}
          </Text>
        </View>
        <Text className="text-gray-400 text-2xl">km/h</Text>
      </View> */}
      <Speedometer speed={speed} />
    </View>
  );
}
