import crypto from "crypto";
import { getDb } from "./db.js";

export interface AlertRecord {
  id: string;
  targetId: string;
  airlineId: string;
  flightKey: string;
  alertedAt: string;
  channel: string;
}

export function wasAlerted(flightKey: string, channel: string, cooldownHours = 24): boolean {
  const db = getDb();
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  const row = db.prepare(
    "SELECT id FROM alert_history WHERE flight_key = ? AND channel = ? AND alerted_at > ? LIMIT 1"
  ).get(flightKey, channel, cutoff);
  return !!row;
}

export function recordAlert(targetId: string, airlineId: string, flightKey: string, channel: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO alert_history (id, target_id, airline_id, flight_key, alerted_at, channel) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), targetId, airlineId, flightKey, new Date().toISOString(), channel);
}
