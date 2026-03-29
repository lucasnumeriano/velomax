import { FontAwesome } from "@expo/vector-icons";
import { Pressable, View, Text } from "react-native";
import MapView from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { DARK_MAP_STYLE, GOOGLE_MAPS_KEY } from "@/constants";
import { LocationState } from "@/hooks";
import { Destination } from "@/types";
import { formatDistance, formatETA } from "@/utils";
import Toast from "react-native-toast-message";

type Props = {
  mapRef: React.RefObject<MapView | null>;
  location: LocationState;
  smoothHeading: number;
  inverted: boolean;
  destination: Destination | null;
  routeDistance: number | null;
  routeDuration: number | null;
  onRouteReady: (distance: number, duration: number) => void;
  onPress: () => void;
};

/**
 * Mini-mapa estilo radar exibido no canto superior esquerdo do HUD.
 *
 * Funcionalidades:
 * - Mapa escuro com rotacao baseada no heading do veiculo
 * - Seta triangular central indicando a posicao do veiculo
 * - Rota desenhada quando ha destino definido
 * - Overlay com ETA e distancia quando rota ativa
 * - Toque abre o mapa em tela cheia
 *
 * O MapView usa inline style para width/height pois nao aceita className.
 * A seta triangular usa border trick (sem equivalente Tailwind).
 */
export function MiniMap({
  mapRef,
  location,
  smoothHeading,
  inverted,
  destination,
  routeDistance,
  routeDuration,
  onRouteReady,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      className="absolute top-6 left-6 items-center justify-center w-[440px] h-[340px]"
    >
      {/* Borda externa estilo radar */}
      <View className="absolute w-[440px] h-[340px] rounded-lg" />

      {/* Mapa */}
      <View className="bg-black overflow-hidden w-[420px] h-[320px] rounded-md">
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
          showsCompass={true}
          showsBuildings={true}
          showsTraffic={true}
        >
          {destination && GOOGLE_MAPS_KEY ? (
            <MapViewDirections
              origin={{
                latitude: Math.round(location.latitude * 1e4) / 1e4,
                longitude: Math.round(location.longitude * 1e4) / 1e4,
              }}
              destination={
                destination.placeId
                  ? `place_id:${destination.placeId}`
                  : {
                      latitude: destination.latitude,
                      longitude: destination.longitude,
                    }
              }
              apikey={GOOGLE_MAPS_KEY}
              strokeWidth={19}
              strokeColor="#00c8ff"
              optimizeWaypoints
              resetOnChange={false}
              onReady={(result) => {
                onRouteReady(result.distance * 1000, result.duration);
              }}
              onError={(error) => {
                Toast.show({
                  type: "error",
                  text1: "Erro ao tracar rota",
                  text2: `Google Directions API: ${error ?? "verifique a chave e billing"}`,
                  visibilityTime: 10000,
                });
              }}
            />
          ) : null}
        </MapView>
      </View>

      {/* Seta do veiculo (border trick, sem equivalente Tailwind) */}
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

      {/* Info da rota */}
      {destination && routeDistance && routeDuration ? (
        <View className="absolute top-2 right-2">
          <View
            className={`px-2 py-1 rounded flex-row items-center gap-5 min-w-[90px] ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
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
  );
}
