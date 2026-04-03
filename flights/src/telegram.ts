#!/usr/bin/env node
import { Telegraf } from "telegraf";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listTargets, getTarget, createTarget } from "./db.js";
import { getRecentRuns } from "./runs.js";
import { getResults } from "./results.js";
import { resolveDateSpec, searchTargetInputSchema } from "./schema.js";
import { findAirlinesForRoute } from "./registry.js";
import { extractJson } from "./util.js";
import type { RankedFlight } from "./ranking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../config/telegram.json");
const REPO_ROOT = path.resolve(__dirname, "../..");

interface TelegramConfig {
  allowedUserIds: number[];
  alertChatIds: number[];
}

let cachedConfig: TelegramConfig | null = null;
function loadConfig(): TelegramConfig {
  if (!cachedConfig) {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as TelegramConfig;
  }
  return cachedConfig!;
}

function flightIcon(departureTime: string): string {
  const match = departureTime.match(/^(\d+):/);
  if (!match) return "✈";
  const hour = parseInt(match[1], 10);
  return (hour >= 6 && hour < 18) ? "☀" : "☽";
}

function formatAlert(flight: RankedFlight, origin: string, destination: string, departureDate: string, searchClass: string): string {
  const miles = Math.round(flight.relevantMiles / 1000);
  const cls = searchClass === "business" ? "ʙᴜꜱɪɴᴇꜱꜱ" : searchClass === "first" ? "ꜰɪʀꜱᴛ" : "ᴇᴄᴏɴᴏᴍʏ";
  const stopsStr = flight.stops.length === 0 ? "nonstop" : `${flight.stops.length} stop ⦗${flight.stops.join(", ")}⦘`;

  // Date formatting
  const d = new Date(departureDate);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateStr = `${months[d.getMonth()]} ${d.getDate()}`;

  // Seat scarcity bar
  let seatStr = "";
  if (flight.seatsRemaining) {
    const match = flight.seatsRemaining.match(/(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    const bars = "▮".repeat(Math.min(count, 10));
    seatStr = `\n  ${bars} ${flight.seatsRemaining}`;
  }

  return `${flightIcon(flight.departureTime)} ${miles}ᴋ ᴍɪʟᴇꜱ ⦁ ${origin} ᐅ ${destination}\n\n  ${cls} ⸱ ${dateStr}\n  ${flight.duration} ⸱ ${stopsStr}\n  ${flight.departureTime} ᐅ ${flight.arrivalTime} ⸱ ${flight.aircraft || ""}${seatStr}`;
}

// Exported for use by alerts.ts dispatchAlerts
let botInstance: Telegraf | null = null;

export async function sendTelegramAlert(flight: RankedFlight, origin: string, destination: string, departureDate: string, searchClass: string): Promise<void> {
  const config = loadConfig();
  if (config.alertChatIds.length === 0) return;

  const message = formatAlert(flight, origin, destination, departureDate, searchClass);

  // If bot is running in this process, use it directly
  if (botInstance) {
    for (const chatId of config.alertChatIds) {
      await botInstance.telegram.sendMessage(chatId, message);
    }
    return;
  }

  // Otherwise, use the Telegram API directly via the token
  const token = process.env.PHANTOM_TELEGRAM_TOKEN;
  if (!token) { console.error("[telegram] No PHANTOM_TELEGRAM_TOKEN set, skipping alert"); return; }

  const { Telegram } = await import("telegraf");
  const api = new Telegram(token);
  for (const chatId of config.alertChatIds) {
    await api.sendMessage(chatId, message);
  }
}

function parseClaudeResponse(message: string): { action: string; params: any } {
  const prompt = `You are a flight search assistant parsing a Telegram message. Determine what action the user wants and return ONLY a JSON object with "action" and "params" fields.

Available actions:
- "add": User wants to create a search target. Extract: origin (IATA), destination (IATA), class, passengers, tripType, stops, searchMode, dateSpec, duration. Use the same schema as the flight search system.
- "list": User wants to see their search targets.
- "run": User wants to run a search. Extract: targetId (if mentioned), fast (boolean, if they say "fast" or "quick").
- "results": User wants to see past results. Extract: targetId.
- "runs": User wants to see run history.
- "status": User wants a general status update.
- "help": User needs help understanding commands.

Return ONLY valid JSON like: {"action": "list", "params": {}}
Or: {"action": "add", "params": {"origin": "IAH", "destination": "HNL", "class": "business", "tripType": "roundtrip", "dateSpec": {"type": "rolling", "earliest": {"offset": 90, "unit": "days"}, "latest": {"offset": 180, "unit": "days"}}}}

User message: "${message.replace(/"/g, '\\"')}"`;

  const result = execFileSync("claude", ["-p", prompt], {
    encoding: "utf-8",
    timeout: 30000,
  }).trim();

  return extractJson(result);
}

async function handleMessage(text: string): Promise<string> {
  const { action, params } = parseClaudeResponse(text);

  switch (action) {
    case "list": {
      const targets = listTargets(true);
      if (targets.length === 0) return "No active search targets.";
      return targets.map(t => {
        const dates = resolveDateSpec(t.dateSpec);
        return `⦁ ${t.origin} ᐅ ${t.destination} (${t.class})\n  ${dates.start} to ${dates.end}\n  Airlines: ${t.airlines.join(", ") || "none"}\n  ID: ${t.id}`;
      }).join("\n\n");
    }

    case "add": {
      const validated = searchTargetInputSchema.parse(params);
      const airlines = findAirlinesForRoute(validated.origin, validated.destination, validated.stops, validated.searchMode);
      const target = createTarget(validated, airlines.map(a => a.id));
      return `✓ Target created\n\n⦁ ${target.origin} ᐅ ${target.destination} (${target.class})\n  Airlines: ${target.airlines.join(", ") || "none"}\n  ID: ${target.id}`;
    }

    case "run": {
      const targetId = params.targetId;
      if (!targetId) {
        const targets = listTargets(true);
        if (targets.length === 0) return "No active targets to run.";
        if (targets.length === 1) return `Running search for ${targets[0].origin} ᐅ ${targets[0].destination}...\n\nUse: run ${targets[0].id}`;
        return "Which target? Send: run <target-id>\n\n" + targets.map(t => `⦁ ${t.origin} ᐅ ${t.destination}: ${t.id}`).join("\n");
      }
      return `Search started for target ${targetId}. Results will be sent when complete.`;
    }

    case "results": {
      const rows = getResults(params.targetId);
      if (rows.length === 0) return "No results found.";
      const latest = rows[0];
      const parsed = JSON.parse(latest.rawJson);
      if (!parsed.flights?.length) return "No flights in latest results.";
      return `Latest: ${latest.origin} ᐅ ${latest.destination} (${latest.departureDate})\n${latest.flightCount} flights\n\n` +
        parsed.flights.slice(0, 5).map((f: any) => `${f.departureTime} ᐅ ${f.arrivalTime} (${f.duration}) ${f.businessMiles?.toLocaleString() || f.economyMiles?.toLocaleString()} miles`).join("\n");
    }

    case "runs": {
      const runs = getRecentRuns(params.targetId, 5);
      if (runs.length === 0) return "No recent runs.";
      return runs.map(r => `${r.status === "success" ? "✓" : "✗"} ${r.airlineId} ⸱ ${r.departureDate} ⸱ ${r.resultCount ?? 0} flights`).join("\n");
    }

    case "status": {
      const targets = listTargets(true);
      const runs = getRecentRuns(undefined, 5);
      return `${targets.length} active target${targets.length !== 1 ? "s" : ""}\n${runs.length} recent runs\n\nSay "list" for targets or "runs" for history.`;
    }

    case "help":
      return `ꜰʟɪɢʜᴛ ꜱᴇᴀʀᴄʜ ʙᴏᴛ\n\nSay things like:\n⦁ "add business IAD to BKK, 3 months out"\n⦁ "list" — show targets\n⦁ "runs" — recent history\n⦁ "results <id>" — past results\n⦁ "status" — overview`;

    default:
      return "I didn't understand that. Say \"help\" for available commands.";
  }
}

async function main() {
  const token = process.env.PHANTOM_TELEGRAM_TOKEN;
  if (!token) {
    console.error("PHANTOM_TELEGRAM_TOKEN not set. Run scripts/setup_telegram.sh first.");
    process.exit(1);
  }

  const config = loadConfig();
  if (config.allowedUserIds.length === 0) {
    console.error("No allowed user IDs configured in flights/config/telegram.json");
    process.exit(1);
  }

  const allowedIds = new Set(config.allowedUserIds);
  const bot = new Telegraf(token);
  botInstance = bot;

  bot.on("text", async (ctx) => {
    if (!allowedIds.has(ctx.from.id)) return;

    const text = ctx.message.text;
    console.log(`[telegram] Message from ${ctx.from.id}: ${text}`);

    try {
      const response = await handleMessage(text);
      await ctx.reply(response);
    } catch (err) {
      console.error(`[telegram] Error: ${(err as Error).message}`);
      await ctx.reply(`Error: ${(err as Error).message.substring(0, 200)}`);
    }
  });

  console.log("[telegram] Bot starting (polling mode)...");
  console.log(`[telegram] Allowed users: ${config.allowedUserIds.join(", ")}`);
  bot.launch();

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main();
