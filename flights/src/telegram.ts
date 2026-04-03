#!/usr/bin/env node
import { Telegraf } from "telegraf";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Auto-load .env from ~/.phantom/.env
const envPath = path.join(process.env.HOME || "~", ".phantom", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) process.env[trimmed.substring(0, eq)] = trimmed.substring(eq + 1);
  }
}
import { listTargets, getTarget, createTarget } from "./db.js";
import { executeSearch } from "./executor.js";
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

// Pending confirmations: chatId → action to execute on confirmation
const pendingConfirmations = new Map<number, { action: any; target: any }>();

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

function buildContext(): string {
  const targets = listTargets(true);
  const runs = getRecentRuns(undefined, 5);

  let ctx = `You have ${targets.length} active search target${targets.length !== 1 ? "s" : ""}.\n`;
  if (targets.length > 0) {
    ctx += "\nTargets:\n";
    for (const t of targets) {
      const dates = resolveDateSpec(t.dateSpec);
      ctx += `- ${t.origin} ᐅ ${t.destination} (${t.class}, ${t.searchMode}) | ${dates.start} to ${dates.end} | airlines: ${t.airlines.join(", ") || "none"} | ID: ${t.id}\n`;
    }
  }
  if (runs.length > 0) {
    ctx += "\nRecent runs:\n";
    for (const r of runs) {
      ctx += `- ${r.status} ${r.airlineId} ${r.departureDate} ${r.resultCount ?? 0} flights\n`;
    }
  }
  return ctx;
}

async function handleMessage(text: string, ctx?: any): Promise<string> {
  // Check for pending confirmation first
  if (ctx && pendingConfirmations.has(ctx.from.id)) {
    const lower = text.toLowerCase().trim();
    const affirmative = ["yes", "y", "yeah", "yep", "yea", "sure", "do it", "go", "ok", "confirm", "approved", "approve", "run it", "go ahead", "send it", "lets go", "let's go"];
    if (affirmative.includes(lower)) {
      const pending = pendingConfirmations.get(ctx.from.id)!;
      pendingConfirmations.delete(ctx.from.id);
      const { action, target } = pending;

      // Execute the search in background
      ctx.reply(`⏳ Searching ${target.origin} ᐅ ${target.destination} via ${target.airlines.join(", ")}...\n\nThis takes a few minutes.`);
      (async () => {
        for (const airlineId of target.airlines) {
          try {
            const results = await executeSearch(target, airlineId, "mid", action.fast ?? false);
            const flightCount = results.flights?.length ?? 0;
            let msg = `✓ Search complete: ${target.origin} ᐅ ${target.destination}\n${flightCount} flights found via ${airlineId}`;
            if (results.flights?.length) {
              msg += "\n\n" + results.flights.slice(0, 5).map((f: any) => {
                const miles = target.class === "business" ? f.businessMiles : f.economyMiles;
                return `${f.departureTime} ᐅ ${f.arrivalTime} (${f.duration}) ${miles?.toLocaleString()} miles`;
              }).join("\n");
            }
            await ctx.reply(msg);
          } catch (err) {
            await ctx.reply(`✗ Search failed for ${airlineId}: ${(err as Error).message.substring(0, 150)}`);
          }
        }
      })();
      return "";  // empty string = don't send another reply (we already sent one)
    } else {
      pendingConfirmations.delete(ctx.from.id);
      return "Search cancelled.";
    }
  }

  const context = buildContext();

  const prompt = `You are a flight search assistant responding via Telegram. Be conversational, friendly, and concise (Telegram messages should be short).

You can help with flight searches by calling the CLI. Here is the current system state:

${context}

When the user wants to ADD a search target, output a JSON block with the search parameters. Use this format:
\`\`\`json
{"action":"add","origin":"IAH","destination":"HNL","class":"business","passengers":1,"tripType":"roundtrip","stops":"any","searchMode":"points","dateSpec":{"type":"rolling","earliest":{"offset":90,"unit":"days"},"latest":{"offset":180,"unit":"days"}},"duration":{"min":7,"max":10,"unit":"days"}}
\`\`\`

When the user wants to RUN a search for a target, output:
\`\`\`json
{"action":"run","targetId":"<id>","fast":false}
\`\`\`
Set fast:true only if the user explicitly says "fast" or "quick". If they don't specify a target ID but only have one target, use that one's ID.

When the user wants to see RESULTS for a target, output:
\`\`\`json
{"action":"results","targetId":"<id>"}
\`\`\`

For anything else (chatting, questions, status updates, greetings), just respond naturally. You don't need JSON for casual conversation. Keep responses short and use the ᐅ arrow and other Unicode characters from the system for style consistency.

User message: ${text}`;

  // Zero tools. Claude is purely text-in text-out. All context is injected
  // into the prompt (targets, runs). All actions are executed by our code
  // after parsing Claude's JSON output. Claude cannot read files, run
  // commands, or access any system resources.
  const child = spawnSync("claude", [
    "-p",
    "--permission-mode", "dontAsk",
    "--allowedTools", "none",
  ], {
    input: prompt,
    encoding: "utf-8",
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Claude exited ${child.status}: ${child.stderr?.substring(0, 200)}`);
  const result = child.stdout.trim();

  // Check if Claude included an action JSON block
  const jsonMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    const action = JSON.parse(jsonMatch[1]);
    let actionResult = "";

    if (action.action === "add") {
      const { action: _, ...params } = action;
      const validated = searchTargetInputSchema.parse(params);
      const airlines = findAirlinesForRoute(validated.origin, validated.destination, validated.stops, validated.searchMode);
      const target = createTarget(validated, airlines.map(a => a.id));
      actionResult = `✓ Target created\n\n⦁ ${target.origin} ᐅ ${target.destination} (${target.class})\n  Airlines: ${target.airlines.join(", ") || "none"}\n  ID: ${target.id}`;
    } else if (action.action === "run" && action.targetId) {
      const target = getTarget(action.targetId);
      if (!target) { actionResult = "Target not found."; }
      else if (target.airlines.length === 0) { actionResult = "No airlines assigned to this target."; }
      else if (ctx) {
        pendingConfirmations.set(ctx.from.id, { action, target });
        actionResult = `Ready to search ${target.origin} ᐅ ${target.destination} (${target.class}) via ${target.airlines.join(", ")}${action.fast ? " ⚡ fast mode" : ""}.\n\nApprove?`;
      }
    } else if (action.action === "results" && action.targetId) {
      const rows = getResults(action.targetId);
      if (rows.length === 0) {
        actionResult = "No results found for that target.";
      } else {
        const latest = rows[0];
        const parsed = JSON.parse(latest.rawJson);
        if (parsed.flights?.length) {
          actionResult = `Latest: ${latest.origin} ᐅ ${latest.destination} (${latest.departureDate})\n${latest.flightCount} flights\n\n` +
            parsed.flights.slice(0, 5).map((f: any) => `${f.departureTime} ᐅ ${f.arrivalTime} (${f.duration}) ${f.businessMiles?.toLocaleString() || f.economyMiles?.toLocaleString()} miles`).join("\n");
        } else {
          actionResult = "No flights in latest results.";
        }
      }
    }

    // Return the action result, stripping the JSON block from Claude's natural text
    const naturalText = result.replace(/```json\s*\n[\s\S]*?\n```/, "").trim();
    return naturalText ? `${naturalText}\n\n${actionResult}` : actionResult;
  }

  // No action block -- just return Claude's conversational response
  return result;
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
      const response = await handleMessage(text, ctx);
      if (response) await ctx.reply(response);
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
