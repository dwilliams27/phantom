import crypto from "crypto";
import { getDb } from "./db.js";

export type RunStatus = "running" | "success" | "captcha" | "login_required" | "error";

// Sentinel strings matched in error messages to detect specific failure modes
// These correspond to the hard rules in CLAUDE.md and TASK.md output conventions
export const CAPTCHA_SENTINEL = "CAPTCHA";
export const LOGIN_SENTINEL = "LOGIN";

export interface SearchRun {
  id: string;
  targetId: string;
  airlineId: string;
  departureDate: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  resultCount: number | null;
  errorMessage: string | null;
}

function rowToRun(row: any): SearchRun {
  return {
    id: row.id,
    targetId: row.target_id,
    airlineId: row.airline_id,
    departureDate: row.departure_date,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    resultCount: row.result_count,
    errorMessage: row.error_message,
  };
}

export function startRun(targetId: string, airlineId: string, departureDate: string): SearchRun {
  const db = getDb();
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO search_runs (id, target_id, airline_id, departure_date, started_at, status)
    VALUES (?, ?, ?, ?, ?, 'running')
  `).run(id, targetId, airlineId, departureDate, startedAt);

  return { id, targetId, airlineId, departureDate, startedAt, finishedAt: null, status: "running", resultCount: null, errorMessage: null };
}

export function completeRun(id: string, resultCount: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE search_runs SET status = 'success', finished_at = ?, result_count = ? WHERE id = ?
  `).run(new Date().toISOString(), resultCount, id);
}

export function failRun(id: string, status: RunStatus, errorMessage: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE search_runs SET status = ?, finished_at = ?, error_message = ? WHERE id = ?
  `).run(status, new Date().toISOString(), errorMessage, id);
}

export function getRunCountsByAirlineToday(): Map<string, number> {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = db.prepare(
    "SELECT airline_id, COUNT(*) as cnt FROM search_runs WHERE started_at >= ? GROUP BY airline_id"
  ).all(today.toISOString()) as Array<{ airline_id: string; cnt: number }>;
  return new Map(rows.map(r => [r.airline_id, r.cnt]));
}

export function getRecentRuns(targetId?: string, limit = 20): SearchRun[] {
  const db = getDb();
  if (targetId) {
    return db.prepare("SELECT * FROM search_runs WHERE target_id = ? ORDER BY started_at DESC LIMIT ?").all(targetId, limit).map(rowToRun);
  }
  return db.prepare("SELECT * FROM search_runs ORDER BY started_at DESC LIMIT ?").all(limit).map(rowToRun);
}
