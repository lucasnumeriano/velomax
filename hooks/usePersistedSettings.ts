import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Brightness from "expo-brightness";
import { useEffect, useState } from "react";

type PersistedSettings = {
  inverted: boolean;
  brightness: number;
  vehicleMode: "car" | "motorcycle";
  speedLimitMode: "auto" | "manual";
  savedSpeedLimit: number | null;
  loaded: boolean;
};

type PersistedActions = {
  setInverted: (value: boolean) => void;
  setBrightness: (value: number) => void;
  setVehicleMode: (mode: "car" | "motorcycle") => void;
  handleToggleTheme: () => Promise<void>;
  handleBrightnessChange: (value: number) => Promise<void>;
  handleVehicleMode: (mode: "car" | "motorcycle") => Promise<void>;
};

/**
 * Hook que carrega e persiste configuracoes do usuario no AsyncStorage.
 *
 * Gerencia:
 * - Tema (normal/invertido)
 * - Brilho da tela
 * - Modo de veiculo (carro/moto)
 * - Modo de limite de velocidade (auto/manual) + valor salvo
 *
 * Todas as alteracoes sao persistidas automaticamente.
 */
export function usePersistedSettings(): PersistedSettings & PersistedActions {
  const [inverted, setInverted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [vehicleMode, setVehicleMode] = useState<"car" | "motorcycle">("car");
  const [speedLimitMode, setSpeedLimitMode] = useState<"auto" | "manual">(
    "auto",
  );
  const [savedSpeedLimit, setSavedSpeedLimit] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const savedTheme = await AsyncStorage.getItem("theme");
      const savedBrightness = await AsyncStorage.getItem("brightness");
      const savedLimit = await AsyncStorage.getItem("speedLimit");
      const savedVehicle = await AsyncStorage.getItem("vehicleMode");
      const savedMode = await AsyncStorage.getItem("speedLimitMode");

      if (savedTheme !== null) {
        setInverted(savedTheme === "inverted");
      }

      try {
        if (savedBrightness !== null) {
          const brightnessValue = parseFloat(savedBrightness);
          setBrightness(brightnessValue);
          await Brightness.setBrightnessAsync(brightnessValue);
        } else {
          const currentBrightness = await Brightness.getBrightnessAsync();
          setBrightness(currentBrightness);
        }
      } catch {
        // Activity pode nao estar disponivel durante inicializacao no Android
      }

      if (savedLimit !== null) {
        setSavedSpeedLimit(parseInt(savedLimit, 10));
      }

      if (savedVehicle === "car" || savedVehicle === "motorcycle") {
        setVehicleMode(savedVehicle);
      }

      if (savedMode === "auto" || savedMode === "manual") {
        setSpeedLimitMode(savedMode);
      }

      setLoaded(true);
    })();
  }, []);

  const handleToggleTheme = async () => {
    const newInverted = !inverted;
    setInverted(newInverted);
    await AsyncStorage.setItem("theme", newInverted ? "inverted" : "normal");
  };

  const handleBrightnessChange = async (value: number) => {
    setBrightness(value);
    await Brightness.setBrightnessAsync(value);
    await AsyncStorage.setItem("brightness", value.toString());
  };

  const handleVehicleMode = async (mode: "car" | "motorcycle") => {
    setVehicleMode(mode);
    await AsyncStorage.setItem("vehicleMode", mode);
  };

  return {
    inverted,
    brightness,
    vehicleMode,
    speedLimitMode,
    savedSpeedLimit,
    loaded,
    setInverted,
    setBrightness,
    setVehicleMode,
    handleToggleTheme,
    handleBrightnessChange,
    handleVehicleMode,
  };
}
