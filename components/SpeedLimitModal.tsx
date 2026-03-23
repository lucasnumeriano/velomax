import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome6 } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

type Props = {
  visible: boolean;
  inverted: boolean;
  speedLimit: number | null;
  speedLimitMode: "auto" | "manual";
  autoSpeedLimitRef: React.MutableRefObject<number | null>;
  onClose: () => void;
  onSetSpeedLimit: (limit: number | null) => void;
  onSetSpeedLimitMode: (mode: "auto" | "manual") => void;
  onSetAutoSpeedLimit: (limit: number | null) => void;
};

/**
 * Modal para configurar o limite de velocidade.
 *
 * Opcoes:
 * - Automatico: usa deteccao via Overpass API (OpenStreetMap)
 * - Presets manuais: 30, 40, 50, 60, 80, 100, 120 km/h
 * - Desativar: remove o limite e volta ao modo automatico
 *
 * Todas as escolhas sao persistidas no AsyncStorage.
 */
export function SpeedLimitModal({
  visible,
  inverted,
  speedLimit,
  speedLimitMode,
  autoSpeedLimitRef,
  onClose,
  onSetSpeedLimit,
  onSetSpeedLimitMode,
  onSetAutoSpeedLimit,
}: Props) {
  const handleAutoMode = async () => {
    onSetSpeedLimitMode("auto");
    await AsyncStorage.setItem("speedLimitMode", "auto");
    if (autoSpeedLimitRef.current !== null) {
      onSetSpeedLimit(autoSpeedLimitRef.current);
    } else {
      onSetSpeedLimit(null);
    }
    await AsyncStorage.removeItem("speedLimit");
    onClose();
  };

  const handlePreset = async (value: number) => {
    onSetSpeedLimitMode("manual");
    onSetSpeedLimit(value);
    await AsyncStorage.setItem("speedLimitMode", "manual");
    await AsyncStorage.setItem("speedLimit", value.toString());
    onClose();
  };

  const handleDisable = async () => {
    onSetSpeedLimitMode("auto");
    onSetSpeedLimit(null);
    onSetAutoSpeedLimit(null);
    autoSpeedLimitRef.current = null;
    await AsyncStorage.setItem("speedLimitMode", "auto");
    await AsyncStorage.removeItem("speedLimit");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/60"
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            className={`rounded-2xl p-8 mx-8 items-center min-w-[300px] ${inverted ? "bg-white" : "bg-gray-900"}`}
          >
            <Text
              className={`text-2xl font-bold mb-6 ${inverted ? "text-black" : "text-white"}`}
            >
              Limite de Velocidade
            </Text>

            {/* Botao Automatico */}
            <Pressable
              onPress={handleAutoMode}
              className={`w-full px-4 py-3 rounded-lg border mb-4 flex-row items-center justify-center gap-2 ${
                speedLimitMode === "auto"
                  ? "border-cyan-400 bg-cyan-400/20"
                  : inverted
                    ? "border-gray-300 bg-gray-100"
                    : "border-gray-600 bg-gray-800"
              }`}
            >
              <FontAwesome6
                name="location-crosshairs"
                size={18}
                color={
                  speedLimitMode === "auto"
                    ? "#22d3ee"
                    : inverted
                      ? "black"
                      : "white"
                }
              />
              <Text
                className={`text-lg font-bold ${
                  speedLimitMode === "auto"
                    ? "text-cyan-400"
                    : inverted
                      ? "text-black"
                      : "text-white"
                }`}
              >
                Automatico
              </Text>
            </Pressable>

            {/* Presets */}
            <View className="flex-row flex-wrap justify-center gap-2 mb-6">
              {[30, 40, 50, 60, 80, 100, 120].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => handlePreset(v)}
                  className={`px-4 py-2 rounded-lg border ${
                    speedLimitMode === "manual" && speedLimit === v
                      ? "border-cyan-400 bg-cyan-400/20"
                      : inverted
                        ? "border-gray-300 bg-gray-100"
                        : "border-gray-600 bg-gray-800"
                  }`}
                >
                  <Text
                    className={`text-xl font-bold ${
                      speedLimitMode === "manual" && speedLimit === v
                        ? "text-cyan-400"
                        : inverted
                          ? "text-black"
                          : "text-white"
                    }`}
                  >
                    {v}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Desativar */}
            <Pressable
              onPress={handleDisable}
              className="border border-red-500 bg-red-500/20 px-6 py-3 rounded-lg"
            >
              <Text className="text-red-400 text-lg font-bold">Desativar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
