/**
 * Chave da API do Google Maps para Android, carregada do .env.
 * Lanca um erro se a variavel nao estiver configurada.
 */
export const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;

if (!GOOGLE_MAPS_KEY) {
  throw new Error(
    "EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY nao esta configurada no .env",
  );
}
