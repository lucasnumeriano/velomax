import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

type Props = {
  onComplete: () => void;
};

/**
 * Overlay de animacao de startup estilo CRT (TV antiga ligando).
 *
 * Sequencia:
 * 1. Tela preta com linha horizontal branca no centro (tubo energizando)
 * 2. Linha expande verticalmente ate preencher a tela
 * 3. Overlay faz fade out revelando o HUD por baixo
 *
 * Usa apenas Animated do React Native (sem dependencias extras).
 * Inline styles obrigatorios: Animated requer style prop para interpolacoes.
 */
export function StartupOverlay({ onComplete }: Props) {
  const lineScaleY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const lineOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Guarda o callback numa ref para que a animacao rode uma unica vez.
  // O parent passa uma arrow inline, cuja identidade muda a cada render;
  // depender dela diretamente reiniciaria a animacao a cada tick do GPS.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    Animated.sequence([
      // Fase 1: linha horizontal aparece no centro (0-300ms)
      Animated.parallel([
        Animated.timing(lineOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(lineScaleY, {
          toValue: 0.005,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),

      // Fase 2: linha expande verticalmente (300-700ms)
      Animated.parallel([
        Animated.timing(lineScaleY, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),

      // Fase 3: overlay faz fade out revelando o HUD (700-1200ms)
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(lineOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onCompleteRef.current();
    });
  }, [lineOpacity, glowOpacity, lineScaleY, overlayOpacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      {/* Glow branco atras da linha (efeito de brilho do tubo CRT) */}
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: glowOpacity,
            transform: [{ scaleY: lineScaleY }],
          },
        ]}
      />

      {/* Linha horizontal CRT */}
      <Animated.View
        style={[
          styles.line,
          {
            opacity: lineOpacity,
            transform: [{ scaleY: lineScaleY }],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  line: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
  },
  glow: {
    position: "absolute",
    width: "120%",
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
});
