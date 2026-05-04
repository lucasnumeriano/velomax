import { useEffect, useRef, useState } from "react";
import type { LocationState } from "@/hooks";
import {
  openTripDb,
  loadTrip,
  saveTrip,
  resetTripDistance,
  resetTripBDistance,
  resetTripAvgSpeed,
} from "@/db";
import type { SQLiteDatabase } from "expo-sqlite";

/** Estado e controles do trip computer. */
export type TripState = {
  activeTrip: "A" | "B";
  tripDistance: number; // metros
  avgSpeed: number; // km/h
  toggleTrip: () => void;
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
 * Hook que acumula distancia percorrida (Trip A/B) e calcula velocidade media.
 *
 * Usa acumuladores separados para Trip A e vel. media, permitindo reset
 * independente sem corromper a outra metrica.
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
  const tripADistanceRef = useRef(0);
  const tripBDistanceRef = useRef(0);
  const avgDistanceRef = useRef(0);
  const movingTimeRef = useRef(0);
  const lastLatRef = useRef<number | null>(null);
  const lastLngRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);
  const dirtyRef = useRef(false);

  // Estado exposto para UI (atualizado a cada GPS update)
  const [activeTrip, setActiveTrip] = useState<"A" | "B">("A");
  const [tripADistance, setTripADistance] = useState(0);
  const [tripBDistance, setTripBDistance] = useState(0);
  const [avgDistance, setAvgDistance] = useState(0);
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
      tripADistanceRef.current = row.trip_distance_m;
      tripBDistanceRef.current = row.trip_b_distance_m;
      avgDistanceRef.current = row.avg_distance_m;
      movingTimeRef.current = row.moving_time_s;
      lastLatRef.current = row.last_lat;
      lastLngRef.current = row.last_lng;
      lastTimestampRef.current = row.last_timestamp;
      setTripADistance(row.trip_distance_m);
      setTripBDistance(row.trip_b_distance_m);
      setAvgDistance(row.avg_distance_m);
      setMovingTime(row.moving_time_s);
    })().catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // --- Flush pendente ao desmontar ---
  useEffect(() => {
    return () => {
      if (dbRef.current && dirtyRef.current) {
        saveTrip(dbRef.current, {
          trip_distance_m: tripADistanceRef.current,
          trip_b_distance_m: tripBDistanceRef.current,
          avg_distance_m: avgDistanceRef.current,
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

    // Acumula ambos trips + media
    tripADistanceRef.current += deltaDist;
    tripBDistanceRef.current += deltaDist;
    avgDistanceRef.current += deltaDist;
    movingTimeRef.current += deltaTime;
    dirtyRef.current = true;

    // Atualiza UI
    setTripADistance(tripADistanceRef.current);
    setTripBDistance(tripBDistanceRef.current);
    setAvgDistance(avgDistanceRef.current);
    setMovingTime(movingTimeRef.current);

    // Throttle: persiste a cada 5s
    if (now - lastSaveRef.current >= 5000) {
      lastSaveRef.current = now;
      dirtyRef.current = false;
      saveTrip(dbRef.current, {
        trip_distance_m: tripADistanceRef.current,
        trip_b_distance_m: tripBDistanceRef.current,
        avg_distance_m: avgDistanceRef.current,
        moving_time_s: movingTimeRef.current,
        last_lat: location.latitude,
        last_lng: location.longitude,
        last_timestamp: now,
      }).catch(() => {});
    }
  }, [location, speed]);

  // --- Vel. media: (avg_dist / tempo) * 3.6 ---
  const avgSpeed = movingTime > 0 ? (avgDistance / movingTime) * 3.6 : 0;
  const tripDistance = activeTrip === "A" ? tripADistance : tripBDistance;

  const handleToggleTrip = () => {
    setActiveTrip((current) => (current === "A" ? "B" : "A"));
  };

  // --- Reset handlers ---
  const handleResetDistance = async () => {
    if (!dbRef.current) return;
    lastLatRef.current = null;
    lastLngRef.current = null;
    lastTimestampRef.current = null;
    dirtyRef.current = false;

    if (activeTrip === "A") {
      tripADistanceRef.current = 0;
      setTripADistance(0);
      await resetTripDistance(dbRef.current).catch(() => {});
      return;
    }

    tripBDistanceRef.current = 0;
    setTripBDistance(0);
    await resetTripBDistance(dbRef.current).catch(() => {});
  };

  const handleResetAvgSpeed = async () => {
    if (!dbRef.current) return;
    avgDistanceRef.current = 0;
    movingTimeRef.current = 0;
    lastLatRef.current = null;
    lastLngRef.current = null;
    lastTimestampRef.current = null;
    dirtyRef.current = false;
    setAvgDistance(0);
    setMovingTime(0);
    await resetTripAvgSpeed(dbRef.current).catch(() => {});
  };

  return {
    activeTrip,
    tripDistance,
    avgSpeed,
    toggleTrip: handleToggleTrip,
    resetDistance: handleResetDistance,
    resetAvgSpeed: handleResetAvgSpeed,
  };
}
