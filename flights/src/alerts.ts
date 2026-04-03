import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./db.js";
import { rankFlights } from "./ranking.js";
import type { Flight, RankedFlight, RankingConfig } from "./ranking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALERTS_CONFIG_PATH = path.resolve(__dirname, "../config/alerts.json");

export interface SearchContext {
  targetId: string;
  airlineId: string;
  origin: string;
  destination: string;
  departureDate: string;
}

export interface AlertRecord {
  id: string;
  targetId: string;
  airlineId: string;
  flightKey: string;
  alertedAt: string;
  channel: string;
}

interface AlertConditions {
  maxBusinessPoints?: number;
  maxEconomyPoints?: number;
}

interface AlertRule {
  targetId: string;
  conditions: AlertConditions;
  channels: string[];
  cooldownHours: number;
}

interface AlertsConfig {
  defaultRanking: RankingConfig;
  rules: AlertRule[];
}

export interface AlertAction {
  flight: RankedFlight;
  channel: string;
  flightKey: string;
}

let cachedAlertsConfig: AlertsConfig | null = null;

export function loadAlertsConfig(): AlertsConfig {
  if (!cachedAlertsConfig) {
    cachedAlertsConfig = JSON.parse(fs.readFileSync(ALERTS_CONFIG_PATH, "utf-8"));
  }
  return cachedAlertsConfig!;
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

function buildFlightKey(origin: string, destination: string, departureDate: string, flight: RankedFlight): string {
  return `${origin}-${destination}-${departureDate}-${flight.departureTime}-${flight.relevantMiles}`;
}

function findRule(targetId: string, rules: AlertRule[]): AlertRule | null {
  return rules.find(r => r.targetId === targetId) || rules.find(r => r.targetId === "*") || null;
}

export function evaluateAlerts(
  ctx: SearchContext,
  rankedFlights: RankedFlight[],
  searchClass: string,
): AlertAction[] {
  const config = loadAlertsConfig();
  const rule = findRule(ctx.targetId, config.rules);
  if (!rule) return [];

  const actions: AlertAction[] = [];

  for (const flight of rankedFlights) {
    // Check threshold conditions
    const miles = flight.relevantMiles;
    if (searchClass === "business" && rule.conditions.maxBusinessPoints && miles > rule.conditions.maxBusinessPoints) continue;
    if (searchClass === "economy" && rule.conditions.maxEconomyPoints && miles > rule.conditions.maxEconomyPoints) continue;

    const flightKey = buildFlightKey(ctx.origin, ctx.destination, ctx.departureDate, flight);

    for (const channel of rule.channels) {
      if (wasAlerted(flightKey, channel, rule.cooldownHours)) continue;

      actions.push({ flight, channel, flightKey });
    }
  }

  return actions;
}

export function dispatchAlerts(
  ctx: SearchContext,
  actions: AlertAction[],
): void {
  for (const action of actions) {
    const { flight, channel, flightKey } = action;
    const stopsStr = flight.stops.length === 0 ? "nonstop" : `${flight.stops.length} stop${flight.stops.length > 1 ? "s" : ""} (${flight.stops.join(", ")})`;

    if (channel === "console") {
      console.log(`  🔔 DEAL: ${ctx.origin}→${ctx.destination} ${ctx.departureDate} | ${flight.departureTime}→${flight.arrivalTime} (${flight.duration}) | ${flight.relevantMiles.toLocaleString()} miles | ${stopsStr}${flight.seatsRemaining ? ` | ${flight.seatsRemaining}` : ""}`);
    }
    // Future: channel === "telegram" → send via Telegram bot API (4D)

    recordAlert(ctx.targetId, ctx.airlineId, flightKey, channel);
  }
}

export function processAlertPipeline(ctx: SearchContext, flights: Flight[], searchClass: string): RankedFlight[] {
  const config = loadAlertsConfig();
  const ranked = rankFlights(flights, config.defaultRanking, searchClass);
  const actions = evaluateAlerts(ctx, ranked, searchClass);
  if (actions.length) {
    dispatchAlerts(ctx, actions);
  }
  return ranked;
}

function rowToAlert(row: any): AlertRecord {
  return {
    id: row.id,
    targetId: row.target_id,
    airlineId: row.airline_id,
    flightKey: row.flight_key,
    alertedAt: row.alerted_at,
    channel: row.channel,
  };
}

export function getAlertHistory(targetId?: string, limit = 20): AlertRecord[] {
  const db = getDb();
  if (targetId) {
    return db.prepare("SELECT * FROM alert_history WHERE target_id = ? ORDER BY alerted_at DESC LIMIT ?")
      .all(targetId, limit).map(rowToAlert);
  }
  return db.prepare("SELECT * FROM alert_history ORDER BY alerted_at DESC LIMIT ?")
    .all(limit).map(rowToAlert);
}
