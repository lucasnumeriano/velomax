import { Text, View } from "react-native";

type Props = {
  batteryLevel: number;
  inverted: boolean;
};

/**
 * Indicador visual de bateria com barra de preenchimento colorida.
 *
 * Cores da barra:
 * - Azul (#00c8ff): > 50%
 * - Laranja (#ffa500): 20-50%
 * - Vermelho (#ff4444): < 20%
 */
export function BatteryIndicator({ batteryLevel, inverted }: Props) {
  const fillColor =
    batteryLevel > 0.5
      ? "#00c8ff"
      : batteryLevel > 0.2
        ? "#ffa500"
        : "#ff4444";

  return (
    <View className="absolute bottom-11 left-28 flex-row items-center gap-2">
      {/* Corpo da bateria */}
      <View
        className={`border-2 ${
          inverted ? "border-black" : "border-gray-300"
        } rounded w-[50px] h-[24px] p-[2px]`}
      >
        {/* Barra de preenchimento */}
        <View
          style={{
            width: `${batteryLevel * 100}%`,
            height: "100%",
            backgroundColor: fillColor,
            borderRadius: 1,
          }}
        />
      </View>
      {/* Ponta da bateria */}
      <View
        className={`w-[3px] h-[12px] rounded-sm ${inverted ? "bg-black" : "bg-gray-300"}`}
      />
      {/* Porcentagem */}
      <Text
        className={`text-lg ${inverted ? "text-black" : "text-gray-300"}`}
      >
        {Math.round(batteryLevel * 100)}%
      </Text>
    </View>
  );
}
