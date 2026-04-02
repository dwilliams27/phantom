#!/usr/bin/env node
import { execFileSync } from "child_process";
import { searchTargetInputSchema, resolveDateSpec } from "./schema.js";
import { createTarget, listTargets, getTarget, deactivateTarget, activateTarget } from "./db.js";

const PARSE_PROMPT = `Parse this flight search request into a structured JSON object. Extract:
- origin: IATA airport code (e.g., IAH for Houston)
- destination: IATA airport code (e.g., HNL for Honolulu)
- passengers: number (default 1)
- class: "economy" | "business" | "first" (default "economy")
- tripType: "oneway" | "roundtrip" (default "roundtrip")
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
  console.log(`  Passengers:  ${t.passengers}`);
  console.log(`  Date spec:   ${t.dateSpec.type === "rolling" ? `rolling (${t.dateSpec.earliest.offset} ${t.dateSpec.earliest.unit} - ${t.dateSpec.latest.offset} ${t.dateSpec.latest.unit})` : `fixed (${t.dateSpec.start} to ${t.dateSpec.end})`}`);
  console.log(`  Resolves to: ${dates.start} to ${dates.end}`);
  console.log(`  Airlines:    ${t.airlines.length ? t.airlines.join(", ") : "(none assigned)"}`);
  console.log(`  Active:      ${t.active}`);
  console.log(`  Created:     ${t.createdAt}`);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "add": {
    const input = args.join(" ");
    if (!input) { console.error("Usage: cli add \"<natural language search request>\""); process.exit(1); }

    if (args[0] === "--json") {
      // Direct JSON input, skip Claude
      const raw = JSON.parse(args.slice(1).join(" "));
      const validated = searchTargetInputSchema.parse(raw);
      const target = createTarget(validated);
      console.log("Search target created:\n");
      printTarget(target);
    } else {
      console.log("Parsing search request...");
      const raw = parseNaturalLanguage(input);
      const validated = searchTargetInputSchema.parse(raw);
      const target = createTarget(validated);
      console.log("Search target created:\n");
      printTarget(target);
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
    console.log("Commands: add, list, show, disable, enable");
    console.log("");
    console.log("  add \"<natural language>\"   Parse and create a search target");
    console.log("  add --json '{...}'         Create from raw JSON");
    console.log("  list [--all]               List active targets (--all includes disabled)");
    console.log("  show <id>                  Show target details");
    console.log("  disable <id>               Deactivate a target");
    console.log("  enable <id>                Reactivate a target");
    break;
}
