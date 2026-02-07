import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

export default function Index() {
  const [speed, setSpeed] = useState(0);
  const [time, setTime] = useState("");

  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    heading: number;
  } | null>(null);

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
        (location) => {
          const kmh = (location.coords.speed ?? 0) * 3.6;
          setSpeed(kmh);

          setLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading ?? 0,
          });
        },
      );
    })();

    return () => clearInterval(clock);
  }, []);

  return (
    <View className="flex-1 bg-panel items-center justify-center px-6">
      {location && (
        <View className="absolute top-6 left-6 rounded-2xl overflow-hidden border border-gray-700 bg-black">
          <MapView
            style={{ width: 130, height: 130 }}
            region={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.002,
              longitudeDelta: 0.002,
            }}
            camera={{
              center: {
                latitude: location.latitude,
                longitude: location.longitude,
              },
              heading: location.heading, // 🔥 AQUI O GTA ACONTECE
              pitch: 0,
              zoom: 18,
              altitude: 0,
            }}
            rotateEnabled={false} // desliga gesto, mas deixa o código girar
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            showsCompass={false}
            showsBuildings={false}
            showsTraffic={false}
          >
            {/* Player fixo */}
            <Marker coordinate={location}>
              <View className="w-3 h-3 bg-cyan-400 rounded-full border border-white" />
            </Marker>
          </MapView>
        </View>
      )}

      {/* Hora */}
      <View className="absolute top-10 right-12">
        <Text className="text-gray-300 text-3xl tracking-widest">{time}</Text>
      </View>

      {/* Speed */}
      <View className="items-center gap-2">
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
      </View>
    </View>
  );
}
