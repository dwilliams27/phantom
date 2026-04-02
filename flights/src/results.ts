import crypto from "crypto";
import { getDb } from "./db.js";

export interface SearchResultRow {
  id: string;
  targetId: string;
  airlineId: string;
  searchedAt: string;
  departureDate: string;
  origin: string;
  destination: string;
  searchMode: string;
  rawJson: string;
  flightCount: number;
}

export function saveResults(
  targetId: string,
  airlineId: string,
  departureDate: string,
  origin: string,
  destination: string,
  searchMode: string,
  rawJson: string,
  flightCount: number,
): SearchResultRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const searchedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO search_results (id, target_id, airline_id, searched_at, departure_date, origin, destination, search_mode, raw_json, flight_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, targetId, airlineId, searchedAt, departureDate, origin, destination, searchMode, rawJson, flightCount);

  return { id, targetId, airlineId, searchedAt, departureDate, origin, destination, searchMode, rawJson, flightCount };
}

function rowToResult(row: any): SearchResultRow {
  return {
    id: row.id,
    targetId: row.target_id,
    airlineId: row.airline_id,
    searchedAt: row.searched_at,
    departureDate: row.departure_date,
    origin: row.origin,
    destination: row.destination,
    searchMode: row.search_mode,
    rawJson: row.raw_json,
    flightCount: row.flight_count,
  };
}

export function getResults(targetId?: string, airlineId?: string): SearchResultRow[] {
  const db = getDb();
  let query = "SELECT * FROM search_results";
  const conditions: string[] = [];
  const params: string[] = [];

  if (targetId) { conditions.push("target_id = ?"); params.push(targetId); }
  if (airlineId) { conditions.push("airline_id = ?"); params.push(airlineId); }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY searched_at DESC";

  return db.prepare(query).all(...params).map(rowToResult);
}

export function getLatestResults(targetId: string): SearchResultRow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM search_results WHERE target_id = ? ORDER BY searched_at DESC LIMIT 1").get(targetId);
  return row ? rowToResult(row) : null;
}
