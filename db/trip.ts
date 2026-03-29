import * as SQLite from "expo-sqlite";

/** Tipo dos dados de trip persistidos no banco. */
export type TripRow = {
  distance_m: number;
  moving_time_s: number;
  last_lat: number | null;
  last_lng: number | null;
  last_timestamp: number | null;
};

/**
 * Abre (ou cria) o banco SQLite e garante que a tabela trip existe.
 * Retorna a instancia do banco pronta para uso.
 */
export async function openTripDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("velomax.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trip (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      distance_m REAL DEFAULT 0,
      moving_time_s REAL DEFAULT 0,
      last_lat REAL,
      last_lng REAL,
      last_timestamp INTEGER
    );
    INSERT OR IGNORE INTO trip (id) VALUES (1);
  `);
  return db;
}

/**
 * Carrega os dados de trip do banco.
 * Retorna distancia acumulada e tempo em movimento.
 */
export async function loadTrip(
  db: SQLite.SQLiteDatabase,
): Promise<TripRow> {
  const row = await db.getFirstAsync<TripRow>(
    "SELECT distance_m, moving_time_s, last_lat, last_lng, last_timestamp FROM trip WHERE id = 1",
  );
  return (
    row ?? {
      distance_m: 0,
      moving_time_s: 0,
      last_lat: null,
      last_lng: null,
      last_timestamp: null,
    }
  );
}

/**
 * Salva os dados de trip no banco (upsert na linha id=1).
 */
export async function saveTrip(
  db: SQLite.SQLiteDatabase,
  data: TripRow,
): Promise<void> {
  await db.runAsync(
    "UPDATE trip SET distance_m = ?, moving_time_s = ?, last_lat = ?, last_lng = ?, last_timestamp = ? WHERE id = 1",
    data.distance_m,
    data.moving_time_s,
    data.last_lat,
    data.last_lng,
    data.last_timestamp,
  );
}

/**
 * Reseta apenas a distancia do Trip A.
 * Zera distance_m e limpa last_lat/lng/timestamp para recomecar o tracking.
 */
export async function resetTripDistance(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync(
    "UPDATE trip SET distance_m = 0, last_lat = NULL, last_lng = NULL, last_timestamp = NULL WHERE id = 1",
  );
}

/**
 * Reseta a velocidade media.
 * Zera distance_m E moving_time_s (ambos necessarios pois avg = dist/tempo).
 * Limpa last_lat/lng/timestamp para recomecar o tracking.
 */
export async function resetTripAvgSpeed(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync(
    "UPDATE trip SET distance_m = 0, moving_time_s = 0, last_lat = NULL, last_lng = NULL, last_timestamp = NULL WHERE id = 1",
  );
}
