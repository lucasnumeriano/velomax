import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = {
  speed: number; // km/h - valor digital
  smoothSpeed: number; // km/h - valor do arco/ponteiro
  maxSpeed?: number;
  inverted?: boolean;
};

export function Speedometer({
  speed,
  smoothSpeed,
  maxSpeed = 240,
  inverted = false,
}: Props) {
  const size = 360;
  const strokeWidthBg = 8;
  const strokeWidthProgress = 3;
  const radius = (size - strokeWidthBg) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = Math.min(smoothSpeed / maxSpeed, 1);
  const strokeDashoffset = circumference - circumference * progress;

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size} pointerEvents="none">
        {/* Fundo */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={inverted ? "#e2e8f0" : "#1e293b"}
          strokeWidth={strokeWidthBg}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          transform={`rotate(135, ${size / 2}, ${size / 2})`}
        />

        {/* Progresso */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#00c8ff"
          strokeWidth={strokeWidthProgress}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(135, ${size / 2}, ${size / 2})`}
        />
      </Svg>

      {/* Digital */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <Text
          style={{
            color: inverted ? "#000" : "#fff",
            fontSize: 150,
            fontWeight: "700",
            lineHeight: 150,
          }}
        >
          {speed.toFixed(0)}
        </Text>
        <Text style={{ color: inverted ? "#374151" : "#9ca3af", fontSize: 28 }}>
          km/h
        </Text>
      </View>
    </View>
  );
}
