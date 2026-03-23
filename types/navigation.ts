/**
 * Coordenadas de destino para navegacao.
 * Quando `placeId` esta presente, a rota e tracada ate a entrada
 * do estabelecimento (via Google Directions place_id) em vez de
 * usar as coordenadas brutas lat/lng.
 */
export type Destination = {
  latitude: number;
  longitude: number;
  placeId?: string;
};
