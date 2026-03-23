import * as Battery from "expo-battery";
import { useEffect, useState } from "react";

/**
 * Hook que monitora o nível da bateria do dispositivo.
 * Retorna o nível da bateria como um número entre 0 e 1, ou null se indisponível.
 */
export function useBattery() {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  useEffect(() => {
    let subscription: ReturnType<typeof Battery.addBatteryLevelListener> | null =
      null;

    (async () => {
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(level);

      subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        setBatteryLevel(batteryLevel);
      });
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  return batteryLevel;
}
