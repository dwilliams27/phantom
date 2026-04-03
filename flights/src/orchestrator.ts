#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { listTargets } from "./db.js";
import { executeSearch } from "./executor.js";
import { getRunCountsByAirlineToday } from "./runs.js";
import { processAlertPipeline } from "./alerts.js";
import type { SearchTarget } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../config/orchestrator.json");

const orchestratorConfigSchema = z.object({
  maxPerAirline: z.number().int().positive(),
  minDelayMs: z.number().int().nonnegative(),
  maxDelayMs: z.number().int().positive(),
  enabled: z.boolean(),
});

type OrchestratorConfig = z.infer<typeof orchestratorConfigSchema>;

function loadConfig(): OrchestratorConfig {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  return orchestratorConfigSchema.parse(raw);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface SearchTask {
  target: SearchTarget;
  airlineId: string;
}

async function main() {
  const config = loadConfig();

  if (!config.enabled) {
    console.log("[orchestrator] Disabled in config. Exiting.");
    return;
  }

  const targets = listTargets(true);
  if (targets.length === 0) {
    console.log("[orchestrator] No active search targets. Exiting.");
    return;
  }

  // Build task list
  const allTasks: SearchTask[] = targets.flatMap(t =>
    t.airlines.map(a => ({ target: t, airlineId: a }))
  );

  shuffle(allTasks);

  // Apply per-airline frequency cap (single SQL query for today's counts)
  const todayCounts = getRunCountsByAirlineToday();
  const plannedCounts = new Map<string, number>();
  const tasks = allTasks.filter(t => {
    const today = todayCounts.get(t.airlineId) || 0;
    const planned = plannedCounts.get(t.airlineId) || 0;
    if (today + planned >= config.maxPerAirline) return false;
    plannedCounts.set(t.airlineId, planned + 1);
    return true;
  });

  const skipped = allTasks.length - tasks.length;
  console.log(`[orchestrator] ${tasks.length} searches to process${skipped ? ` (${skipped} skipped by frequency cap)` : ""}`);
  console.log("");

  let successes = 0;
  let failures = 0;

  for (let i = 0; i < tasks.length; i++) {
    const { target, airlineId } = tasks[i];

    if (i > 0) {
      const delayMs = randomBetween(config.minDelayMs, config.maxDelayMs);
      console.log(`[orchestrator] Waiting ${(delayMs / 1000).toFixed(0)}s before next search...`);
      await sleep(delayMs);
    }

    console.log(`[orchestrator] [${i + 1}/${tasks.length}] ${target.name} via ${airlineId}`);

    try {
      const results = await executeSearch(target, airlineId, "random");
      const count = results.flights?.length ?? 0;
      console.log(`[orchestrator] Done: ${count} flights found`);

      if (results.flights?.length) {
        const ctx = { targetId: target.id, airlineId, origin: target.origin, destination: target.destination, departureDate: results.departureDate || "unknown" };
        processAlertPipeline(ctx, results.flights, target.class);
      }

      successes++;
    } catch (err) {
      console.error(`[orchestrator] FAILED: ${(err as Error).message}`);
      failures++;
    }
  }

  console.log("");
  console.log(`[orchestrator] Complete. ${successes} succeeded, ${failures} failed.`);
}

main();
