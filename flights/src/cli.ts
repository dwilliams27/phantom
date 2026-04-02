#!/usr/bin/env node
import { execFileSync } from "child_process";
import readline from "readline";
import { searchTargetInputSchema, resolveDateSpec } from "./schema.js";
import { createTarget, listTargets, getTarget, deactivateTarget, activateTarget } from "./db.js";
import { loadRegistry, findAirlinesForRoute, hasNonstop } from "./registry.js";
import type { SearchTargetInput } from "./schema.js";

const PARSE_PROMPT = `Parse this flight search request into a structured JSON object. Extract:
- origin: IATA airport code (e.g., IAH for Houston)
- destination: IATA airport code (e.g., HNL for Honolulu)
- passengers: number (default 1)
- class: "economy" | "business" | "first" (default "economy")
- tripType: "oneway" | "roundtrip" (default "roundtrip")
- stops: "any" | "nonstop" | "max1stop" (default "any")
- duration: {"min": N, "max": N, "unit": "days"} for roundtrip length (optional)
- dateSpec: rolling or fixed date specification

For dates like "3 months from now" or "at least 90 days out", use rolling:
{"type": "rolling", "earliest": {"offset": 90, "unit": "days"}, "latest": {"offset": 180, "unit": "days"}}

For dates like "in June" or "June 15-22, 2026", use fixed:
{"type": "fixed", "start": "2026-06-15", "end": "2026-06-22"}

If no date specified, default to rolling 30-90 days out.
If no duration specified for roundtrip, default to 7-10 days.

Return ONLY valid JSON, no markdown, no explanation.`;

function parseNaturalLanguage(input: string): any {
  const prompt = `${PARSE_PROMPT}\n\nUser request: "${input}"`;
  const result = execFileSync("claude", ["-p", prompt], {
    encoding: "utf-8",
    timeout: 30000,
  }).trim();

  // Strip markdown code fences if Claude wraps the JSON
  const cleaned = result.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(cleaned);
}

function printTarget(t: any): void {
  const dates = resolveDateSpec(t.dateSpec);
  console.log(`  ID:          ${t.id}`);
  console.log(`  Name:        ${t.name}`);
  console.log(`  Route:       ${t.origin} → ${t.destination}`);
  console.log(`  Class:       ${t.class}`);
  console.log(`  Trip:        ${t.tripType}${t.duration ? ` (${t.duration.min}-${t.duration.max} days)` : ""}`);
  console.log(`  Stops:       ${t.stops}`);
  console.log(`  Passengers:  ${t.passengers}`);
  console.log(`  Date spec:   ${t.dateSpec.type === "rolling" ? `rolling (${t.dateSpec.earliest.offset} ${t.dateSpec.earliest.unit} - ${t.dateSpec.latest.offset} ${t.dateSpec.latest.unit})` : `fixed (${t.dateSpec.start} to ${t.dateSpec.end})`}`);
  console.log(`  Resolves to: ${dates.start} to ${dates.end}`);
  console.log(`  Airlines:    ${t.airlines.length ? t.airlines.join(", ") : "(none assigned)"}`);
  console.log(`  Active:      ${t.active}`);
  console.log(`  Created:     ${t.createdAt}`);
}

function askConfirmation(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function suggestAirlines(input: SearchTargetInput): Promise<string[]> {
  const matches = findAirlinesForRoute(input.origin, input.destination, input.stops);
  if (matches.length === 0) {
    console.log("  No matching airlines found in registry for this route/stops combination.");
    return [];
  }
  console.log(`\n  Suggested airlines (${matches.length}):`);
  for (const a of matches) {
    const nonstop = hasNonstop(a, input.origin, input.destination);
    console.log(`    - ${a.name} (${a.id})${nonstop ? " [nonstop available]" : " [via " + a.hubs.join("/") + "]"}`);
  }
  if (process.argv.includes("--yes")) {
    console.log("  Auto-accepted (--yes flag).");
    return matches.map(a => a.id);
  }
  const answer = await askConfirmation("\n  Accept these airlines? (Y/n/edit): ");
  if (answer.toLowerCase() === "n") return [];
  if (answer.toLowerCase() === "edit" || answer.toLowerCase() === "e") {
    const ids = await askConfirmation("  Enter airline IDs (comma-separated): ");
    return ids.split(",").map(s => s.trim()).filter(Boolean);
  }
  return matches.map(a => a.id);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "add": {
      const filteredArgs = args.filter(a => a !== "--yes");
      const input = filteredArgs.join(" ");
      if (!input) { console.error("Usage: cli add \"<natural language search request>\""); process.exit(1); }

      let validated: SearchTargetInput;
      if (filteredArgs[0] === "--json") {
        const raw = JSON.parse(filteredArgs.slice(1).join(" "));
        validated = searchTargetInputSchema.parse(raw);
      } else {
        console.log("Parsing search request...");
        const raw = parseNaturalLanguage(input);
        validated = searchTargetInputSchema.parse(raw);
      }

      const airlines = await suggestAirlines(validated);
      const target = createTarget(validated, airlines);
      console.log("\nSearch target created:\n");
      printTarget(target);
      break;
    }

    case "airlines": {
      const registry = loadRegistry();
      console.log(`${registry.length} airline${registry.length !== 1 ? "s" : ""} in registry:\n`);
      for (const a of registry) {
        console.log(`  ${a.name} (${a.id})`);
        console.log(`    Status: ${a.status}`);
        console.log(`    Hubs: ${a.hubs.join(", ")}`);
        console.log(`    Regions: ${a.regions.join(", ")}`);
        console.log(`    Nonstop routes: ${a.nonstopRoutes.length}`);
        console.log(`    URL: ${a.searchUrl}`);
        console.log("");
      }
      break;
    }

    case "list": {
      const all = args.includes("--all");
      const targets = listTargets(!all);
      if (targets.length === 0) {
        console.log(all ? "No search targets found." : "No active search targets. Use --all to see disabled targets.");
      } else {
        console.log(`${targets.length} search target${targets.length > 1 ? "s" : ""}:\n`);
        for (const t of targets) {
          printTarget(t);
          console.log("");
        }
      }
      break;
    }

    case "show": {
      const id = args[0];
      if (!id) { console.error("Usage: cli show <id>"); process.exit(1); }
      const target = getTarget(id);
      if (!target) { console.error(`Target not found: ${id}`); process.exit(1); }
      printTarget(target);
      break;
    }

    case "disable": {
      const id = args[0];
      if (!id) { console.error("Usage: cli disable <id>"); process.exit(1); }
      deactivateTarget(id);
      console.log(`Target ${id} disabled.`);
      break;
    }

    case "enable": {
      const id = args[0];
      if (!id) { console.error("Usage: cli enable <id>"); process.exit(1); }
      activateTarget(id);
      console.log(`Target ${id} enabled.`);
      break;
    }

    default:
      console.log("Usage: cli <command> [args]");
      console.log("Commands: add, airlines, list, show, disable, enable");
      console.log("");
      console.log("  add \"<natural language>\"   Parse and create a search target");
      console.log("  add --json '{...}'         Create from raw JSON (--yes to auto-accept airlines)");
      console.log("  airlines                   List airlines in the registry");
      console.log("  list [--all]               List active targets (--all includes disabled)");
      console.log("  show <id>                  Show target details");
      console.log("  disable <id>               Deactivate a target");
      console.log("  enable <id>                Reactivate a target");
      break;
  }
}

main();
