import { AntDesign } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Pressable, Text, View } from "react-native";

type Props = {
  brightness: number;
  inverted: boolean;
  showBrightness: boolean;
  onToggle: () => void;
  onBrightnessChange: (value: number) => Promise<void>;
};

/**
 * Controle de brilho da tela.
 *
 * Composto por:
 * - Icone de sol (toggle para mostrar/esconder slider)
 * - Slider de brilho (0-100%) com persistencia no AsyncStorage
 */
export function BrightnessControl({
  brightness,
  inverted,
  showBrightness,
  onToggle,
  onBrightnessChange,
}: Props) {
  return (
    <>
      <Pressable
        onPress={onToggle}
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
          className={`absolute bottom-20 left-12 p-4 rounded-lg w-[200px] ${
            inverted ? "bg-gray-200" : "bg-gray-800"
          }`}
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
            onValueChange={onBrightnessChange}
            minimumTrackTintColor="#00c8ff"
            maximumTrackTintColor={inverted ? "#999" : "#333"}
            thumbTintColor="#00c8ff"
          />
        </View>
      ) : null}
    </>
  );
}
