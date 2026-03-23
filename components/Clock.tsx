import { Text, View } from "react-native";

type Props = {
  time: string;
  inverted: boolean;
};

/**
 * Exibe o horario atual no formato HH:MM.
 * Posicionado de forma absoluta no canto inferior esquerdo do HUD.
 */
export function Clock({ time, inverted }: Props) {
  return (
    <View className="absolute bottom-10 left-[385px]">
      <Text
        className={`text-3xl tracking-widest ${
          inverted ? "text-black" : "text-gray-300"
        }`}
      >
        {time}
      </Text>
    </View>
  );
}
