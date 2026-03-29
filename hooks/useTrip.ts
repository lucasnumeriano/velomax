import { useEffect, useRef, useState } from "react";
import type { LocationState } from "./useLocation";
import {
  openTripDb,
  loadTrip,
  saveTrip,
  resetTripDistance,
  resetTripAvgSpeed,
} from "@/db";
import type { SQLiteDatabase } from "expo-sqlite";

/** Estado e controles do trip computer. */
export type TripState = {
  tripDistance: number; // metros
  avgSpeed: number; // km/h
  resetDistance: () => void;
  resetAvgSpeed: () => void;
};

const EARTH_RADIUS = 6_371_000; // metros

/**
 * Calcula a distancia em metros entre dois pontos usando formula de Haversine.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Hook que acumula distancia percorrida (Trip A) e calcula velocidade media.
 *
 * Persiste dados em expo-sqlite com throttle de 5s.
 * Ignora GPS drift (speed < 2 km/h), saltos (> 500m), e gaps (> 60s).
 *
 * @param location - posicao GPS atual (de useLocation). null = sem GPS.
 * @param speed - velocidade GPS real em km/h (de useLocation). NAO usar effectiveSpeed.
 */
export function useTrip(
  location: LocationState | null,
  speed: number,
): TripState {
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const distanceRef = useRef(0);
  const movingTimeRef = useRef(0);
  const lastLatRef = useRef<number | null>(null);
  const lastLngRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);
  const dirtyRef = useRef(false);

  // Estado exposto para UI (atualizado a cada GPS update)
  const [tripDistance, setTripDistance] = useState(0);
  const [movingTime, setMovingTime] = useState(0);

  // --- Inicializacao: abre banco e carrega dados ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      const db = await openTripDb();
      if (!mounted) return;
      dbRef.current = db;
      const row = await loadTrip(db);
      if (!mounted) return;
      distanceRef.current = row.distance_m;
      movingTimeRef.current = row.moving_time_s;
      lastLatRef.current = row.last_lat;
      lastLngRef.current = row.last_lng;
      lastTimestampRef.current = row.last_timestamp;
      setTripDistance(row.distance_m);
      setMovingTime(row.moving_time_s);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // --- Flush pendente ao desmontar ---
  useEffect(() => {
    return () => {
      if (dbRef.current && dirtyRef.current) {
        saveTrip(dbRef.current, {
          distance_m: distanceRef.current,
          moving_time_s: movingTimeRef.current,
          last_lat: lastLatRef.current,
          last_lng: lastLngRef.current,
          last_timestamp: lastTimestampRef.current,
        }).catch(() => {});
      }
    };
  }, []);

  // --- Acumula distancia e tempo a cada GPS update ---
  useEffect(() => {
    if (!location || !dbRef.current) return;

    const now = Date.now();
    const prevLat = lastLatRef.current;
    const prevLng = lastLngRef.current;
    const prevTs = lastTimestampRef.current;

    // Atualiza referencia de posicao sempre
    lastLatRef.current = location.latitude;
    lastLngRef.current = location.longitude;
    lastTimestampRef.current = now;

    // Se nao tem ponto anterior, so salva referencia
    if (prevLat === null || prevLng === null || prevTs === null) return;

    // Ignora drift GPS quando parado
    if (speed < 2) return;

    const deltaTime = (now - prevTs) / 1000; // segundos

    // Descarta gaps (app em background, GPS sumiu)
    if (deltaTime > 60) return;

    const deltaDist = haversineDistance(
      prevLat,
      prevLng,
      location.latitude,
      location.longitude,
    );

    // Descarta saltos GPS (teleporte)
    if (deltaDist > 500) return;

    // Acumula
    distanceRef.current += deltaDist;
    movingTimeRef.current += deltaTime;
    dirtyRef.current = true;

    // Atualiza UI
    setTripDistance(distanceRef.current);
    setMovingTime(movingTimeRef.current);

    // Throttle: persiste a cada 5s
    if (now - lastSaveRef.current >= 5000) {
      lastSaveRef.current = now;
      dirtyRef.current = false;
      saveTrip(dbRef.current, {
        distance_m: distanceRef.current,
        moving_time_s: movingTimeRef.current,
        last_lat: location.latitude,
        last_lng: location.longitude,
        last_timestamp: now,
      }).catch(() => {});
    }
  }, [location, speed]);

  // --- Vel. media: (dist / tempo) * 3.6 ---
  const avgSpeed = movingTime > 0 ? (tripDistance / movingTime) * 3.6 : 0;

  // --- Reset handlers ---
  const handleResetDistance = async () => {
    if (!dbRef.current) return;
    distanceRef.current = 0;
    lastLatRef.current = null;
    lastLngRef.current = null;
    lastTimestampRef.current = null;
    dirtyRef.current = false;
    setTripDistance(0);
    await resetTripDistance(dbRef.current).catch(() => {});
  };

  const handleResetAvgSpeed = async () => {
    if (!dbRef.current) return;
    distanceRef.current = 0;
    movingTimeRef.current = 0;
    lastLatRef.current = null;
    lastLngRef.current = null;
    lastTimestampRef.current = null;
    dirtyRef.current = false;
    setTripDistance(0);
    setMovingTime(0);
    await resetTripAvgSpeed(dbRef.current).catch(() => {});
  };

  return {
    tripDistance,
    avgSpeed,
    resetDistance: handleResetDistance,
    resetAvgSpeed: handleResetAvgSpeed,
  };
}
