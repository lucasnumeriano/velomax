import { Animated, Pressable, Text, View } from "react-native";

type Props = {
  speedLimit: number | null;
  speedLimitMode: "auto" | "manual";
  speed: number;
  inverted: boolean;
  flashAnim: Animated.Value;
  onPress: () => void;
};

/**
 * Botao que exibe o limite de velocidade atual (MAX).
 *
 * - Mostra "(A)" quando em modo automatico
 * - Pisca amarelo/laranja via flashAnim quando o limite muda
 * - Fica vermelho quando a velocidade excede o limite
 * - Fica cyan quando dentro do limite
 * - Fica cinza quando sem limite definido
 *
 * O estilo usa Animated.View com interpolacao — inline styles sao obrigatorios.
 */
export function SpeedLimitButton({
  speedLimit,
  speedLimitMode,
  speed,
  inverted,
  flashAnim,
  onPress,
}: Props) {
  const exceeded = speedLimit !== null && speed > speedLimit;

  const textColorClass = speedLimit
    ? exceeded
      ? "text-red-400"
      : "text-cyan-400"
    : inverted
      ? "text-gray-600"
      : "text-gray-400";

  const valueColorClass = speedLimit
    ? exceeded
      ? "text-red-400"
      : "text-cyan-400"
    : inverted
      ? "text-black"
      : "text-white";

  return (
    <Pressable onPress={onPress} className="absolute top-10 right-12">
      <Animated.View
        style={{
          borderColor: flashAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [
              exceeded
                ? "#ef4444"
                : speedLimit
                  ? "#22d3ee"
                  : inverted
                    ? "#9ca3af"
                    : "#6b7280",
              "#f59e0b",
            ],
          }),
          backgroundColor: flashAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [
              exceeded
                ? "rgba(239,68,68,0.2)"
                : speedLimit
                  ? "rgba(34,211,238,0.2)"
                  : inverted
                    ? "rgba(229,231,235,1)"
                    : "rgba(31,41,55,1)",
              "rgba(245,158,11,0.3)",
            ],
          }),
          borderWidth: 2,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          alignItems: "center",
        }}
      >
        <View className="flex-row items-center gap-1">
          <Text className={`text-xs ${textColorClass}`}>MAX</Text>
          {speedLimitMode === "auto" ? (
            <Text className={`text-xs ${textColorClass}`}>(A)</Text>
          ) : null}
        </View>
        <Text className={`text-2xl font-bold ${valueColorClass}`}>
          {speedLimit ?? "--"}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
