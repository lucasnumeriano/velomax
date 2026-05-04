import { FontAwesome } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

type Props = {
  activeTrip: "A" | "B";
  tripDistance: number; // metros
  avgSpeed: number; // km/h
  inverted: boolean;
  onToggleTrip: () => void;
  onResetDistance: () => void;
  onResetAvgSpeed: () => void;
};

/** Altura do desnivel da curva (quao alto ela sobe). */
const CURVE_H = 20;

/** Largura horizontal da transicao curva (quao alongada ela e). */
const CURVE_W = 80;

/** Extensao horizontal da reta no topo (apos a curva). */
const TOP_LINE = 130;

/**
 * Formata distancia para exibicao.
 * < 1000m → "123 m", >= 1km → "12.3 km"
 */
function formatTripDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("pt-BR")} km`;
}

/**
 * Formata velocidade media para manter o layout estavel com valores altos.
 */
function formatAvgSpeed(speed: number): string {
  return `${Math.round(speed).toLocaleString("pt-BR")} km/h`;
}

/**
 * Exibe Trip ativo (A/B) e velocidade media em uma unica linha
 * logo abaixo do mini-mapa.
 *
 * Uma linha vai da borda esquerda do MiniMap, sobe com dois arcos
 * quarter-circle suaves, e depois segue reta pra direita.
 *
 * Fonte text-3xl (30px) para combinar com o relogio (Clock).
 * Cores seguem o padrao do Speedometer: dark → gray-400, light → gray-700.
 */
export function TripInfo({
  activeTrip,
  tripDistance,
  avgSpeed,
  inverted,
  onToggleTrip,
  onResetDistance,
  onResetAvgSpeed,
}: Props) {
  const textClass = inverted ? "text-black" : "text-white";
  const lineStroke = inverted ? "#d1d5db" : "#4b5563";
  const resetColor = "#6b7280";

  const svgW = 460;

  // Path: horizontal → curva-S suave → reta horizontal no topo
  //
  //                  ________________ (reta no topo)
  //                ~~
  //  ____________~~   (curva bezier comeca aqui)
  //
  // Um unico cubic bezier (C) garante suavidade perfeita sem vincos.
  // Os control points ficam no ponto medio X, um em cada nivel Y,
  // criando uma curva-S simetrica com tangentes horizontais nas pontas.
  const curveX = svgW - CURVE_W - TOP_LINE;
  const endX = curveX + CURVE_W;
  const midX = curveX + CURVE_W / 2;
  const d = [
    `M 0 ${CURVE_H}`,
    `L ${curveX} ${CURVE_H}`,
    `C ${midX} ${CURVE_H}, ${midX} 0, ${endX} 0`,
    `L ${svgW} 0`,
  ].join(" ");

  return (
    <View style={{ width: svgW, height: CURVE_H + 44 }}>
      {/* Linha decorativa: horizontal → curva S → reta no topo */}
      <Svg
        width={svgW}
        height={CURVE_H + 2}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Path
          d={d}
          fill="none"
          stroke={lineStroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>

      {/* Trip A + Media na mesma linha, abaixo da linha horizontal */}
      <View className="absolute flex-row items-center justify-between w-[460px] px-1" style={{ top: CURVE_H + 6 }}>
        {/* Trip ativo */}
        <View className="flex-row items-center gap-2 w-[230px]">
          <Pressable onPress={onToggleTrip} hitSlop={8}>
            <Text className={`text-3xl ${textClass}`}>{`Trip ${activeTrip}`}</Text>
          </Pressable>
          <Text
            className={`text-3xl font-bold ${textClass} flex-1 text-right`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {formatTripDistance(tripDistance)}
          </Text>
          <Pressable onPress={onResetDistance} hitSlop={8}>
            <FontAwesome name="undo" size={20} color={resetColor} />
          </Pressable>
        </View>

        {/* Velocidade media */}
        <View className="flex-row items-center gap-2 w-[210px]">
          <Text className={`text-3xl ${textClass}`}>Média</Text>
          <Text
            className={`text-3xl font-bold ${textClass} flex-1 text-right`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {formatAvgSpeed(avgSpeed)}
          </Text>
          <Pressable onPress={onResetAvgSpeed} hitSlop={8}>
            <FontAwesome name="undo" size={20} color={resetColor} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
