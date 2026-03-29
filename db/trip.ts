import * as SQLite from "expo-sqlite";

/** Tipo dos dados de trip persistidos no banco. */
export type TripRow = {
  trip_distance_m: number;
  avg_distance_m: number;
  moving_time_s: number;
  last_lat: number | null;
  last_lng: number | null;
  last_timestamp: number | null;
};

/**
 * Abre (ou cria) o banco SQLite e garante que a tabela trip existe.
 * Retorna a instancia do banco pronta para uso.
 *
 * Inclui retry com backoff para contornar NullPointerException no Android,
 * onde o NativeDatabase pode nao estar pronto logo apos openDatabaseAsync.
 */
export async function openTripDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("velomax.db");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS trip (
          id INTEGER PRIMARY KEY,
          trip_distance_m REAL DEFAULT 0,
          avg_distance_m REAL DEFAULT 0,
          moving_time_s REAL DEFAULT 0,
          last_lat REAL,
          last_lng REAL,
          last_timestamp INTEGER
        );
      `);
      await db.runAsync("INSERT OR IGNORE INTO trip (id) VALUES (1)");
      return db;
    } catch {
      if (attempt === 2) throw new Error("SQLite init failed after 3 attempts");
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }

  return db;
}

/**
 * Carrega os dados de trip do banco.
 * Retorna distancias acumuladas (trip + avg) e tempo em movimento.
 */
export async function loadTrip(
  db: SQLite.SQLiteDatabase,
): Promise<TripRow> {
  const row = await db.getFirstAsync<TripRow>(
    "SELECT trip_distance_m, avg_distance_m, moving_time_s, last_lat, last_lng, last_timestamp FROM trip WHERE id = 1",
  );
  return (
    row ?? {
      trip_distance_m: 0,
      avg_distance_m: 0,
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
    "UPDATE trip SET trip_distance_m = ?, avg_distance_m = ?, moving_time_s = ?, last_lat = ?, last_lng = ?, last_timestamp = ? WHERE id = 1",
    data.trip_distance_m,
    data.avg_distance_m,
    data.moving_time_s,
    data.last_lat,
    data.last_lng,
    data.last_timestamp,
  );
}

/**
 * Reseta apenas a distancia do Trip A.
 * Zera trip_distance_m. Nao afeta avg_distance_m nem moving_time_s.
 * Limpa last_lat/lng/timestamp para recomecar o tracking.
 */
export async function resetTripDistance(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync(
    "UPDATE trip SET trip_distance_m = 0, last_lat = NULL, last_lng = NULL, last_timestamp = NULL WHERE id = 1",
  );
}

/**
 * Reseta a velocidade media.
 * Zera avg_distance_m e moving_time_s. Nao afeta trip_distance_m.
 * Limpa last_lat/lng/timestamp para recomecar o tracking.
 */
export async function resetTripAvgSpeed(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync(
    "UPDATE trip SET avg_distance_m = 0, moving_time_s = 0, last_lat = NULL, last_lng = NULL, last_timestamp = NULL WHERE id = 1",
  );
}
