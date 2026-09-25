import { useEffect, useRef } from "react";
import { Animated, Text } from "react-native";

type Props = {
  speed: number; // km/h - valor digital
  smoothSpeed: number; // km/h - valor do arco/ponteiro
  maxSpeed?: number;
  inverted?: boolean;
  speedLimit?: number | null;
};

/**
 * Velocimetro digital com display grande de velocidade.
 *
 * Usa pulse animation quando a velocidade excede o limite.
 * A animacao de startup (0 → 240 → 0) eh controlada pelo index.tsx
 * que sobrescreve o valor de speed durante o startup.
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
}: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const exceeded = speedLimit !== null && speed > speedLimit;

  // --- Pulse quando excede limite ---
  useEffect(() => {
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
  }, [exceeded, pulseAnim]);

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
          color: exceeded ? "#ff4444" : inverted ? "#000" : "#fff",
          fontSize: 170,
          fontWeight: "700",
          lineHeight: 150,
        }}
      >
        {speed.toFixed(0)}
      </Text>
      <Text
        style={{
          color: exceeded
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
