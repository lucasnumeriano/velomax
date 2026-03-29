import React from "react";
import { View } from "react-native";
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

type Props = {
  speed: number;
  maxSpeed?: number;
  inverted?: boolean;
};

const SVG_WIDTH = 100;
const SVG_HEIGHT = 290;

/** Velocidades onde aparecem marcadores e numeros */
const TICK_SPEEDS = [40, 80, 120, 160, 200];

/**
 * Path do arco em formato "taco de hockey" — base larga e reta,
 * sobe grosso e dobra quase 90 graus para a direita afinando no topo.
 *
 * Base: ~40px de largura (0-40), reta e horizontal.
 * Corpo: ~30px de largura (4-34), sobe vertical.
 * Topo: curva fechada para a direita, afina ate ~2px na ponta (~90-92).
 */
const ARC_PATH = [
  "M 0 285",
  "L 40 285",
  "L 37 270",
  "L 34 50",
  "C 34 18, 50 3, 90 3",
  "L 92 0",
  "C 46 -2, 6 12, 4 50",
  "L 3 270",
  "L 0 285",
  "Z",
].join(" ");

/** Path da base — faixa horizontal com opacidade extra */
const BASE_PATH = "M 0 285 L 40 285 L 37 270 L 3 270 Z";

const STROKE_WIDTH = 3.5;

const VIEWBOX = `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`;

/**
 * Barra curvada de velocidade com formato de "taco de hockey".
 *
 * Apenas bordas visiveis com fill interior sutil e transparente.
 * A borda usa gradiente de tres zonas: neon -> amarelo -> vermelho.
 * Adapta cores conforme o tema (inverted): bordas brancas no escuro,
 * bordas pretas no claro.
 *
 * Inclui marcadores de velocidade (ticks) com numeros pequenos
 * ao lado esquerdo do arco, na mesma cor da borda ghost.
 *
 * Usa tres camadas sobrepostas:
 * 1. Ghost outline — contorno completo com opacidade baixa + ticks
 * 2. Base overlay — faixa horizontal inferior com opacidade extra
 * 3. Speed fill — borda gradiente + fill sutil, cortado por View
 *    com overflow:hidden e altura dinamica de baixo para cima
 *
 * Inline styles obrigatorios: SVG components requerem style prop,
 * e a altura dinamica da View de clip precisa de calculo em runtime.
 */
export function SpeedArc({ speed, maxSpeed = 240, inverted = false }: Props) {
  const fillPercent = Math.min(Math.max(speed, 0) / maxSpeed, 1);
  const fillHeight = Math.round(SVG_HEIGHT * fillPercent);

  const ghostStroke = inverted ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
  const baseFill = inverted ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const tickColor = inverted ? "#374151" : "#9ca3af";

  return (
    <View style={{ width: SVG_WIDTH, height: SVG_HEIGHT, marginRight: -8 }}>
      {/* Camada 1: Ghost outline + ticks — contorno completo, dim */}
      <Svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={VIEWBOX}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Path
          d={ARC_PATH}
          fill="none"
          stroke={ghostStroke}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="round"
        />
        {/* Base com opacidade extra */}
        <Path d={BASE_PATH} fill={baseFill} stroke="none" />

        {/* Marcadores de velocidade com numeros — lado direito */}
        {TICK_SPEEDS.map((s) => {
          const y = SVG_HEIGHT * (1 - s / maxSpeed);
          return (
            <G key={s}>
              <Line
                x1={38}
                y1={y}
                x2={44}
                y2={y}
                stroke={tickColor}
                strokeWidth={1}
              />
              <SvgText
                x={47}
                y={y + 4}
                fill={tickColor}
                fontSize={16}
                textAnchor="start"
              >
                {s}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Camada 2: Speed fill — borda gradiente + fill sutil, cortado */}
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
          viewBox={VIEWBOX}
          style={{ position: "absolute", bottom: 0, left: 0 }}
        >
          <Defs>
            <LinearGradient id="speedStroke" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ff4444" />
              <Stop offset="0.33" stopColor="#ffd700" />
              <Stop offset="1" stopColor="#00ffcc" />
            </LinearGradient>
            <LinearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(255,68,68,0.08)" />
              <Stop offset="0.33" stopColor="rgba(255,215,0,0.12)" />
              <Stop offset="1" stopColor="rgba(0,255,204,0.15)" />
            </LinearGradient>
          </Defs>
          <Path
            d={ARC_PATH}
            fill="url(#speedFill)"
            stroke="url(#speedStroke)"
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}
