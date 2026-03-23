import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRef, useState } from "react";

const GOOGLE_MAPS_KEY = "AIzaSyD8l0IZqrWKXn5KQP1B_RPX8CjRuohd6sY";

type Props = {
  inverted: boolean;
  location: { latitude: number; longitude: number } | null;
  onSelectPlace: (coordinate: { latitude: number; longitude: number }) => void;
};

/**
 * Campo de busca de endereco com autocomplete via Google Places API.
 *
 * - Debounce de 400ms para evitar requisicoes excessivas
 * - Usa location bias para priorizar resultados proximos
 * - Resultados limitados a geocode e establishments
 * - Idioma: pt-BR
 */
export function AddressSearch({ inverted, location, onSelectPlace }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { place_id: string; description: string }[]
  >([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAddress = async (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.length < 3) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const locationBias = location
          ? `&location=${location.latitude},${location.longitude}&radius=100000`
          : "";
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_KEY}&language=pt-BR&types=geocode|establishment${locationBias}`,
        );
        const data = await res.json();
        if (data.predictions) {
          setSearchResults(
            data.predictions.map((p: any) => ({
              place_id: p.place_id,
              description: p.description,
            })),
          );
        }
      } catch (e) {
        console.error("Erro na busca:", e);
      }
    }, 400);
  };

  const selectPlace = async (placeId: string) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_KEY}`,
      );
      const data = await res.json();
      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        onSelectPlace({ latitude: lat, longitude: lng });
        setSearchQuery("");
        setSearchResults([]);
      }
    } catch (e) {
      console.error("Erro ao obter detalhes do lugar:", e);
    }
  };

  return (
    <View className="mt-3">
      <TextInput
        className={`px-4 py-3 rounded-xl text-lg ${inverted ? "bg-white text-black border border-gray-300" : "bg-gray-800 text-white"}`}
        placeholder="Buscar endereco..."
        placeholderTextColor={inverted ? "#6b7280" : "#9ca3af"}
        value={searchQuery}
        onChangeText={searchAddress}
        autoFocus
        returnKeyType="search"
      />
      {searchResults.length > 0 ? (
        <ScrollView
          className={`mt-1 rounded-xl max-h-[260px] ${inverted ? "bg-white border border-gray-300" : "bg-gray-800"}`}
          keyboardShouldPersistTaps="handled"
        >
          {searchResults.map((result, index) => (
            <Pressable
              key={result.place_id}
              onPress={() => selectPlace(result.place_id)}
              className={`px-4 py-3 ${
                index < searchResults.length - 1
                  ? `border-b ${inverted ? "border-gray-200" : "border-gray-700"}`
                  : ""
              }`}
            >
              <Text
                className={`text-base ${inverted ? "text-black" : "text-white"}`}
                numberOfLines={2}
              >
                {result.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
