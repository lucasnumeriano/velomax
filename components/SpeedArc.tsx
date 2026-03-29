import React from "react";
import { View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
} from "react-native-svg";

type Props = {
  speed: number;
  maxSpeed?: number;
  inverted?: boolean;
};

const SVG_WIDTH = 50;
const SVG_HEIGHT = 260;

/**
 * Arco curvado afinando de baixo para cima.
 *
 * Borda externa (esquerda) curva para a esquerda com control points X baixo.
 * Borda interna (direita) desce com curvatura mais suave.
 * Largura: ~20px na base, ~3px no topo.
 */
const ARC_PATH = [
  "M 45 255",
  "L 25 255",
  "C 5 190, 10 70, 42 5",
  "L 45 5",
  "C 35 70, 30 190, 45 255",
  "Z",
].join(" ");

/**
 * Barra curvada de velocidade exibida ao lado esquerdo do velocimetro.
 *
 * Desenha um arco em forma de "C" (convexo a esquerda) usando SVG que
 * preenche de baixo para cima proporcional a velocidade atual. O arco
 * tem gradiente de tres zonas: neon -> amarelo -> vermelho.
 *
 * Usa duas camadas sobrepostas:
 * 1. Ghost arc (dim) mostrando a extensao total
 * 2. Gradient arc dentro de uma View com overflow:hidden e altura dinamica,
 *    posicionada na parte inferior — essa tecnica substitui ClipPath que
 *    nao re-renderiza confiavelmente no react-native-svg.
 *
 * Inline styles obrigatorios: SVG components requerem style prop,
 * e a altura dinamica da View de clip precisa de calculo em runtime.
 */
export function SpeedArc({
  speed,
  maxSpeed = 300,
  inverted = false,
}: Props) {
  const fillPercent = Math.min(Math.max(speed, 0) / maxSpeed, 1);
  const fillHeight = Math.round(SVG_HEIGHT * fillPercent);

  return (
    <View style={{ width: SVG_WIDTH, height: SVG_HEIGHT, marginRight: -8 }}>
      {/* Camada 1: Ghost arc — extensao total, cor dim */}
      <Svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Path
          d={ARC_PATH}
          fill={inverted ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)"}
        />
      </Svg>

      {/* Camada 2: Gradient arc — cortado pela View com overflow hidden */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: SVG_WIDTH,
          height: fillHeight,
          overflow: "hidden",
        }}
      >
        <Svg
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          style={{ position: "absolute", bottom: 0, left: 0 }}
        >
          <Defs>
            <LinearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ff4444" />
              <Stop offset="0.33" stopColor="#ffd700" />
              <Stop offset="1" stopColor="#00ffcc" />
            </LinearGradient>
          </Defs>
          <Path d={ARC_PATH} fill="url(#speedGradient)" />
        </Svg>
      </View>
    </View>
  );
}
