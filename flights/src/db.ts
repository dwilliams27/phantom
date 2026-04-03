import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { SearchTarget, SearchTargetInput, DateSpec } from "./schema.js";

const DB_DIR = path.join(process.env.HOME || "~", ".phantom", "data");
const DB_PATH = path.join(DB_DIR, "phantom.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_targets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      passengers INTEGER NOT NULL DEFAULT 1,
      class TEXT NOT NULL DEFAULT 'economy',
      trip_type TEXT NOT NULL DEFAULT 'roundtrip',
      stops TEXT NOT NULL DEFAULT 'any',
      search_mode TEXT NOT NULL DEFAULT 'points',
      duration_min INTEGER,
      duration_max INTEGER,
      date_spec TEXT NOT NULL,
      airlines TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_runs (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      airline_id TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      result_count INTEGER,
      error_message TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_history (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      airline_id TEXT NOT NULL,
      flight_key TEXT NOT NULL,
      alerted_at TEXT NOT NULL,
      channel TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alert_history_lookup
    ON alert_history (flight_key, channel, alerted_at)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_results (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      airline_id TEXT NOT NULL,
      searched_at TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      search_mode TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      flight_count INTEGER NOT NULL
    )
  `);

  return db;
}

function rowToTarget(row: any): SearchTarget {
  return {
    id: row.id,
    name: row.name,
    origin: row.origin,
    destination: row.destination,
    passengers: row.passengers,
    class: row.class,
    tripType: row.trip_type,
    stops: row.stops,
    searchMode: row.search_mode,
    duration: row.duration_min ? { min: row.duration_min, max: row.duration_max, unit: "days" as const } : undefined,
    dateSpec: JSON.parse(row.date_spec) as DateSpec,
    airlines: JSON.parse(row.airlines) as string[],
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export function createTarget(input: SearchTargetInput, airlines: string[] = []): SearchTarget {
  const db = getDb();
  const id = crypto.randomUUID();
  const name = input.name || `${input.origin} → ${input.destination} ${input.class}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO search_targets (id, name, origin, destination, passengers, class, trip_type, stops, search_mode, duration_min, duration_max, date_spec, airlines, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id, name, input.origin, input.destination, input.passengers, input.class, input.tripType,
    input.stops, input.searchMode, input.duration?.min ?? null, input.duration?.max ?? null,
    JSON.stringify(input.dateSpec), JSON.stringify(airlines), now,
  );

  return { ...input, id, name, airlines, active: true, createdAt: now };
}

export function listTargets(activeOnly = true): SearchTarget[] {
  const db = getDb();
  const query = activeOnly
    ? "SELECT * FROM search_targets WHERE active = 1 ORDER BY created_at DESC"
    : "SELECT * FROM search_targets ORDER BY created_at DESC";
  return db.prepare(query).all().map(rowToTarget);
}

export function getTarget(id: string): SearchTarget | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM search_targets WHERE id = ?").get(id);
  return row ? rowToTarget(row) : null;
}

export function deactivateTarget(id: string): void {
  const db = getDb();
  db.prepare("UPDATE search_targets SET active = 0 WHERE id = ?").run(id);
}

export function activateTarget(id: string): void {
  const db = getDb();
  db.prepare("UPDATE search_targets SET active = 1 WHERE id = ?").run(id);
}
