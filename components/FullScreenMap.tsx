import { Dimensions, Pressable, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { AddressSearch } from "./AddressSearch";
import { VehicleSelector } from "./VehicleSelector";
import { LocationState } from "@/hooks/useLocation";
import { useState } from "react";

const GOOGLE_MAPS_KEY = "AIzaSyD8l0IZqrWKXn5KQP1B_RPX8CjRuohd6sY";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
];

type Destination = {
  latitude: number;
  longitude: number;
  placeId?: string;
};

type Props = {
  mapRef: React.RefObject<MapView | null>;
  location: LocationState;
  smoothHeading: number;
  inverted: boolean;
  vehicleMode: "car" | "motorcycle";
  destination: Destination | null;
  routeDistance: number | null;
  routeDuration: number | null;
  onClose: () => void;
  onMapPress: (coordinate: Destination) => void;
  onRouteReady: (distance: number, duration: number) => void;
  onClearRoute: () => void;
  onVehicleMode: (mode: "car" | "motorcycle") => Promise<void>;
};

/**
 * Mapa em tela cheia com controles de navegacao.
 *
 * Funcionalidades:
 * - Mapa interativo (scroll, zoom, rotacao)
 * - Toque para definir destino com marcador
 * - Busca de endereco via Google Places Autocomplete
 * - Exibicao de rota com ETA e distancia
 * - Seletor de veiculo (carro/moto)
 * - Botao para retornar a localizacao atual
 * - Botao para limpar rota
 *
 * O MapView usa inline style para dimensoes (SCREEN_WIDTH x SCREEN_HEIGHT)
 * pois nao aceita className para dimensionamento.
 */
export function FullScreenMap({
  mapRef,
  location,
  smoothHeading,
  inverted,
  vehicleMode,
  destination,
  routeDistance,
  routeDuration,
  onClose,
  onMapPress,
  onRouteReady,
  onClearRoute,
  onVehicleMode,
}: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  const formatETA = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const handleMapPress = (e: any) => {
    if (showVehicleDropdown) {
      setShowVehicleDropdown(false);
      return;
    }
    onMapPress(e.nativeEvent.coordinate);
  };

  /** Quando o usuario toca num POI (posto, restaurante, etc.), traca rota ate la usando placeId */
  const handlePoiClick = (e: any) => {
    if (showVehicleDropdown) {
      setShowVehicleDropdown(false);
      return;
    }
    const { coordinate, placeId } = e.nativeEvent;
    onMapPress({ ...coordinate, placeId });
  };

  const handleClose = () => {
    onClose();
    setShowSearch(false);
    setShowVehicleDropdown(false);
  };

  const handleVehicleMode = async (mode: "car" | "motorcycle") => {
    setShowVehicleDropdown(false);
    await onVehicleMode(mode);
  };

  const handlePlaceSelected = (coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    onMapPress(coordinate);
    setShowSearch(false);
    mapRef.current?.animateCamera(
      { center: coordinate, zoom: 15 },
      { duration: 800 },
    );
  };

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
        initialCamera={{
          center: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          heading: smoothHeading,
          pitch: 0,
          zoom: 15,
          altitude: 0,
        }}
        onPress={handleMapPress}
        onPoiClick={handlePoiClick}
        customMapStyle={inverted ? [] : DARK_MAP_STYLE}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        pitchEnabled={false}
        showsCompass={true}
        showsMyLocationButton={false}
        showsUserLocation={true}
        showsTraffic={true}
      >
        {/* Marcador de destino */}
        {destination ? (
          <Marker
            coordinate={destination}
            pinColor="#00c8ff"
            title="Destino"
          />
        ) : null}

        {/* Rota */}
        {destination && GOOGLE_MAPS_KEY ? (
          <MapViewDirections
            origin={{
              latitude: Math.round(location.latitude * 1e4) / 1e4,
              longitude: Math.round(location.longitude * 1e4) / 1e4,
            }}
            destination={
              destination.placeId
                ? `place_id:${destination.placeId}`
                : { latitude: destination.latitude, longitude: destination.longitude }
            }
            apikey={GOOGLE_MAPS_KEY}
            strokeWidth={4}
            strokeColor="#00c8ff"
            optimizeWaypoints
            resetOnChange={false}
            onReady={(result) => {
              onRouteReady(result.distance * 1000, result.duration);
            }}
          />
        ) : null}
      </MapView>

      {/* Controles do mapa fullscreen */}
      <View className="absolute top-10 left-6 right-6">
        {/* Barra superior */}
        <View className="flex-row justify-between items-center">
          {/* Botao Fechar */}
          <Pressable
            onPress={handleClose}
            className={`px-6 py-3 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
          >
            <Text
              className={`text-xl font-bold ${inverted ? "text-black" : "text-white"}`}
            >
              ✕ Fechar
            </Text>
          </Pressable>

          {/* Botoes direita */}
          <View className="flex-row gap-2 items-center">
            {/* Info da rota */}
            {destination && routeDistance && routeDuration ? (
              <View
                className={`px-4 py-2 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
              >
                <Text className="text-cyan-400 text-lg font-bold">
                  ETA: {formatETA(routeDuration)}
                </Text>
                <Text
                  className={`text-base ${inverted ? "text-gray-600" : "text-gray-300"}`}
                >
                  {formatDistance(routeDistance)}
                </Text>
              </View>
            ) : null}

            {/* Seletor de veiculo */}
            <VehicleSelector
              vehicleMode={vehicleMode}
              inverted={inverted}
              showDropdown={showVehicleDropdown}
              onToggleDropdown={() =>
                setShowVehicleDropdown(!showVehicleDropdown)
              }
              onSelectMode={handleVehicleMode}
            />

            {/* Botao Busca */}
            <Pressable
              onPress={() => {
                setShowSearch(!showSearch);
              }}
              className={`px-4 py-3 rounded-lg ${
                showSearch
                  ? "bg-cyan-600/90"
                  : inverted
                    ? "bg-white/90"
                    : "bg-gray-800/90"
              }`}
            >
              <Text
                className={`text-xl ${inverted && !showSearch ? "text-black" : "text-white"}`}
              >
                {"\u{1F50D}"}
              </Text>
            </Pressable>

            {/* Botao Retornar ao local atual */}
            <Pressable
              onPress={() => {
                mapRef.current?.animateCamera(
                  {
                    center: {
                      latitude: location.latitude,
                      longitude: location.longitude,
                    },
                    heading: smoothHeading,
                    zoom: 17,
                  },
                  { duration: 600 },
                );
              }}
              className={`px-4 py-3 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
            >
              <Text
                className={`text-xl ${inverted ? "text-black" : "text-white"}`}
              >
                {"\u{1F4CD}"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Painel de busca */}
        {showSearch ? (
          <AddressSearch
            inverted={inverted}
            location={location}
            onSelectPlace={handlePlaceSelected}
          />
        ) : null}
      </View>

      {/* Instrucoes / Botao Limpar */}
      <View className="absolute bottom-10 left-6 right-6 items-center">
        {!destination ? (
          <View
            className={`px-6 py-3 rounded-lg ${inverted ? "bg-white/90" : "bg-gray-800/90"}`}
          >
            <Text
              className={`text-lg ${inverted ? "text-black" : "text-white"}`}
            >
              {"\u{1F4CD}"} Toque no mapa para marcar destino
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={onClearRoute}
            className="bg-red-600/90 px-6 py-3 rounded-lg"
          >
            <Text className="text-white text-lg font-bold">
              {"\u{1F5D1}\u{FE0F}"} Limpar Rota
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
