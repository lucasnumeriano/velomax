import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = {
  speed: number; // km/h
  maxSpeed?: number;
};

export function Speedometer({ speed, maxSpeed = 240 }: Props) {
  const size = 260;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = Math.min(speed / maxSpeed, 1);
  const strokeDashoffset =
    circumference - circumference * progress;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Fundo */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          rotation={135}
          origin={`${size / 2}, ${size / 2}`}
        />

        {/* Progresso */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#00c8ff"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation={135}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Digital */}
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-white text-[96px] font-semibold">
          {speed.toFixed(0)}
        </Text>
        <Text className="text-gray-400 text-2xl">km/h</Text>
      </View>
    </View>
  );
}
