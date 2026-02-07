import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = {
  speed: number; // km/h
  maxSpeed?: number;
};

export function Speedometer({ speed, maxSpeed = 240 }: Props) {
  const size = 360;
  const strokeWidthBg = 8;
  const strokeWidthProgress = 3;
  const radius = (size - strokeWidthBg) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = Math.min(speed / maxSpeed, 1);
  const strokeDashoffset = circumference - circumference * progress;

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size}>
        {/* Fundo */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1e293b"
          strokeWidth={strokeWidthBg}
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
          strokeWidth={strokeWidthProgress}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation={135}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Digital */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View className="items-center gap-2">
          <View className="relative items-center">
            <View
              className="absolute w-96 h-10 rounded-full"
              style={{
                backgroundColor: "rgba(0, 200, 255, 0.9)",
                bottom: 0,
                filter: "blur(40px)",
              }}
            />
            <Text className="text-white text-[160px] font-semibold leading-none">
              {speed.toFixed(0)}
            </Text>
          </View>
          <Text className="text-gray-400 text-2xl">km/h</Text>
        </View>
      </View>
    </View>
  );
}
