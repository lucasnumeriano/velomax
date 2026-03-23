import { useEffect, useState } from "react";

/**
 * Hook que atualiza o horário atual a cada segundo.
 * Retorna uma string formatada "HH:MM".
 */
export function useClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, "0");
      const m = now.getMinutes().toString().padStart(2, "0");
      setTime(`${h}:${m}`);
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, []);

  return time;
}
