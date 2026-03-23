import { AntDesign, FontAwesome6 } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type Props = {
  vehicleMode: "car" | "motorcycle";
  inverted: boolean;
  showDropdown: boolean;
  onToggleDropdown: () => void;
  onSelectMode: (mode: "car" | "motorcycle") => void;
};

/**
 * Seletor de tipo de veiculo (carro/moto) com dropdown.
 *
 * Exibido no mapa fullscreen. A escolha e persistida via callback.
 * O dropdown usa posicionamento absoluto com z-index elevado.
 */
export function VehicleSelector({
  vehicleMode,
  inverted,
  showDropdown,
  onToggleDropdown,
  onSelectMode,
}: Props) {
  return (
    <View className="relative">
      <Pressable
        onPress={onToggleDropdown}
        className={`px-4 py-3 rounded-lg ${
          showDropdown
            ? "bg-cyan-600/90"
            : inverted
              ? "bg-white/90"
              : "bg-gray-800/90"
        }`}
      >
        {vehicleMode === "car" ? (
          <AntDesign
            name="car"
            size={24}
            color={
              showDropdown ? "white" : inverted ? "black" : "white"
            }
          />
        ) : (
          <FontAwesome6
            name="motorcycle"
            size={24}
            color={
              showDropdown ? "white" : inverted ? "black" : "white"
            }
          />
        )}
      </Pressable>

      {showDropdown ? (
        <View
          className={`absolute rounded-xl overflow-hidden top-[56px] right-0 min-w-[140px] z-[1000] ${
            inverted
              ? "bg-white border border-gray-300"
              : "bg-gray-800"
          }`}
          style={{ elevation: 10 }}
        >
          <Pressable
            onPress={() => onSelectMode("car")}
            className={`px-5 py-3 flex-row items-center gap-3 ${
              vehicleMode === "car" ? "bg-cyan-500/20" : ""
            }`}
          >
            <AntDesign
              name="car"
              size={22}
              color={
                vehicleMode === "car"
                  ? "#22d3ee"
                  : inverted
                    ? "black"
                    : "white"
              }
            />
            <Text
              className={`text-base font-semibold ${
                vehicleMode === "car"
                  ? "text-cyan-400"
                  : inverted
                    ? "text-black"
                    : "text-white"
              }`}
            >
              Carro
            </Text>
          </Pressable>

          <View
            className={`h-px ${inverted ? "bg-gray-200" : "bg-gray-700"}`}
          />

          <Pressable
            onPress={() => onSelectMode("motorcycle")}
            className={`px-5 py-3 flex-row items-center gap-3 ${
              vehicleMode === "motorcycle" ? "bg-cyan-500/20" : ""
            }`}
          >
            <FontAwesome6
              name="motorcycle"
              size={22}
              color={
                vehicleMode === "motorcycle"
                  ? "#22d3ee"
                  : inverted
                    ? "black"
                    : "white"
              }
            />
            <Text
              className={`text-base font-semibold ${
                vehicleMode === "motorcycle"
                  ? "text-cyan-400"
                  : inverted
                    ? "text-black"
                    : "text-white"
              }`}
            >
              Moto
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
