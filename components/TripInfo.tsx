import { FontAwesome } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type Props = {
  tripDistance: number; // metros
  avgSpeed: number; // km/h
  inverted: boolean;
  onResetDistance: () => void;
  onResetAvgSpeed: () => void;
};

/**
 * Formata distancia para exibicao.
 * < 1000m → "123 m", >= 1km → "12.3 km"
 */
function formatTripDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Exibe Trip A (distancia) e velocidade media abaixo do velocimetro.
 *
 * Linha separadora branca no topo, dois valores com botoes de reset individuais.
 * Cores seguem o padrao do "km/h" do Speedometer:
 * dark → #9ca3af, light → #374151.
 */
export function TripInfo({
  tripDistance,
  avgSpeed,
  inverted,
  onResetDistance,
  onResetAvgSpeed,
}: Props) {
  const textColor = inverted ? "#374151" : "#9ca3af";
  const lineColor = inverted ? "bg-gray-300" : "bg-gray-600";
  const resetColor = "#6b7280";

  return (
    <View className="items-center mt-2">
      {/* Linha separadora */}
      <View className={`h-[1px] w-[200px] ${lineColor} mb-2`} />

      {/* Trip A */}
      <View className="flex-row items-center justify-between w-[200px] mb-1">
        <Text style={{ color: textColor, fontSize: 18 }}>Trip A</Text>
        <View className="flex-row items-center gap-2">
          <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
            {formatTripDistance(tripDistance)}
          </Text>
          <Pressable onPress={onResetDistance} hitSlop={8}>
            <FontAwesome name="undo" size={16} color={resetColor} />
          </Pressable>
        </View>
      </View>

      {/* Velocidade media */}
      <View className="flex-row items-center justify-between w-[200px]">
        <Text style={{ color: textColor, fontSize: 18 }}>Media</Text>
        <View className="flex-row items-center gap-2">
          <Text style={{ color: textColor, fontSize: 18, fontWeight: "700" }}>
            {Math.round(avgSpeed)} km/h
          </Text>
          <Pressable onPress={onResetAvgSpeed} hitSlop={8}>
            <FontAwesome name="undo" size={16} color={resetColor} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
