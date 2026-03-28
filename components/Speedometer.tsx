import { useEffect, useRef, useState } from "react";
import { Animated, Text } from "react-native";

type Props = {
  speed: number; // km/h - valor digital
  smoothSpeed: number; // km/h - valor do arco/ponteiro
  maxSpeed?: number;
  inverted?: boolean;
  speedLimit?: number | null;
  startupDone?: boolean;
  onStartupComplete?: () => void;
};

/**
 * Velocimetro digital com display grande de velocidade.
 *
 * Animacao de startup: quando startupDone=false, exibe um contador
 * de 0 a 100 e volta a 0 antes de mostrar a velocidade real.
 * Usa pulse animation quando a velocidade excede o limite.
 *
 * Inline styles obrigatorios: Animated requer style prop para interpolacoes,
 * e Text fontSize/lineHeight nao tem equivalente Tailwind exato.
 */
export function Speedometer({
  speed,
  smoothSpeed,
  maxSpeed = 240,
  inverted = false,
  speedLimit = null,
  startupDone = true,
  onStartupComplete,
}: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const exceeded = speedLimit !== null && speed > speedLimit;

  // --- Animacao de startup (0 → 100 → 0) ---
  const [startupCount, setStartupCount] = useState(0);
  const startupRunning = useRef(false);

  useEffect(() => {
    if (startupDone || startupRunning.current) return;
    startupRunning.current = true;

    const totalUp = 800; // ms para 0→100
    const totalDown = 400; // ms para 100→0
    const fps = 60;
    const intervalMs = 1000 / fps;

    // Fase 1: 0 → 100
    let frame = 0;
    const framesUp = Math.round(totalUp / intervalMs);
    const timerUp = setInterval(() => {
      frame++;
      // Easing out (desacelera no final)
      const progress = frame / framesUp;
      const eased = 1 - Math.pow(1 - progress, 2);
      setStartupCount(Math.round(eased * 100));

      if (frame >= framesUp) {
        clearInterval(timerUp);

        // Fase 2: 100 → 0
        let frameDown = 0;
        const framesDown = Math.round(totalDown / intervalMs);
        const timerDown = setInterval(() => {
          frameDown++;
          const progressDown = frameDown / framesDown;
          const easedDown = 1 - Math.pow(1 - progressDown, 2);
          setStartupCount(Math.round(100 * (1 - easedDown)));

          if (frameDown >= framesDown) {
            clearInterval(timerDown);
            setStartupCount(0);
            onStartupComplete?.();
          }
        }, intervalMs);
      }
    }, intervalMs);

    return () => {
      clearInterval(timerUp);
    };
  }, [startupDone]);

  // --- Pulse quando excede limite ---
  useEffect(() => {
    if (!startupDone) return;

    if (exceeded) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [exceeded, startupDone]);

  const displaySpeed = startupDone ? speed : startupCount;

  return (
    <Animated.View
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: [{ scale: pulseAnim }],
      }}
    >
      <Text
        style={{
          color: exceeded && startupDone
            ? "#ff4444"
            : inverted
              ? "#000"
              : "#fff",
          fontSize: 150,
          fontWeight: "700",
          lineHeight: 150,
        }}
      >
        {displaySpeed.toFixed(0)}
      </Text>
      <Text
        style={{
          color: exceeded && startupDone
            ? "#ff4444"
            : inverted
              ? "#374151"
              : "#9ca3af",
          fontSize: 28,
        }}
      >
        km/h
      </Text>
    </Animated.View>
  );
}
