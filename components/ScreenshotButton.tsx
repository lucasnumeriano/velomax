import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

type Props = {
  inverted: boolean;
  onPress: () => void;
};

/**
 * Botao de captura de tela do HUD.
 * Salva um print na galeria com toque unico.
 */
export function ScreenshotButton({ inverted, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className={`absolute top-10 right-[116px] h-[62px] w-[62px] items-center justify-center rounded-lg border-2 ${
        inverted
          ? "border-gray-400 bg-gray-200"
          : "border-gray-500 bg-gray-800"
      }`}
    >
      <Ionicons
        name="flash"
        size={26}
        color={inverted ? "#111827" : "#22d3ee"}
      />
    </Pressable>
  );
}
