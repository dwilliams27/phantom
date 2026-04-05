import { execFileSync, execSync, spawn as spawnChild } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDateSpec, formatDate } from "./schema.js";
import { getAirline, getTaskPath } from "./registry.js";
import { saveResults } from "./results.js";
import { startRun, completeRun, failRun, CAPTCHA_SENTINEL, LOGIN_SENTINEL } from "./runs.js";
import { extractJson } from "./util.js";
import type { SearchTarget } from "./schema.js";
import type { RunStatus } from "./runs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const PHANTOM_PROFILE = path.join(process.env.HOME || "~", ".phantom-chrome-profile");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_FLAGS = [
  `--user-data-dir=${PHANTOM_PROFILE}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-session-crashed-bubble", "--hide-crash-restore-bubble",
  "--disable-notifications",
  "about:blank",
];

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

function mcpBuildStale(mcpDir: string): boolean {
  const srcDir = path.join(mcpDir, "src");
  const distDir = path.join(mcpDir, "dist");
  if (!fs.existsSync(distDir)) return true;
  return newestMtime(srcDir) > newestMtime(distDir);
}

function launchChrome(): void {
  execSync(`"${CHROME_PATH}" ${CHROME_FLAGS.map(f => `"${f}"`).join(" ")} &>/dev/null &`, { shell: "/bin/bash" });
}

function killChrome(): void {
  // Graceful quit first -- gives Chrome time to flush cookies to disk
  try { execSync('osascript -e \'tell application "Google Chrome" to quit\'', { stdio: "ignore", timeout: 5000 }); } catch (_) {}
  // Wait for graceful shutdown
  try { execSync("sleep 2", { stdio: "ignore" }); } catch (_) {}
  // Force kill anything remaining
  try { execSync('pkill -f "user-data-dir=.*phantom-chrome-profile"', { stdio: "ignore" }); } catch (_) {}
  try { fs.unlinkSync("/tmp/phantom.sock"); } catch (_) {}
}

export function pickDepartureDate(target: SearchTarget, mode: "mid" | "random" = "mid"): string {
  const { start, end } = resolveDateSpec(target.dateSpec);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (mode === "random") {
    return formatDate(new Date(startMs + Math.random() * (endMs - startMs)));
  }
  return formatDate(new Date(startMs + (endMs - startMs) / 2));
}

function buildPrompt(target: SearchTarget, taskContent: string, departureDate: string): string {
  const params = [
    `- Origin: ${target.origin}`,
    `- Destination: ${target.destination}`,
    `- Departure date: ${departureDate}`,
    `- Trip type: ${target.tripType}`,
    `- Passengers: ${target.passengers}`,
    `- Class: ${target.class}`,
  ];
  if (target.tripType === "roundtrip" && target.duration) {
    const returnDate = new Date(departureDate);
    returnDate.setDate(returnDate.getDate() + target.duration.min);
    params.push(`- Return date: ${formatDate(returnDate)}`);
  }

  return `You have Phantom browser automation tools.

Search parameters:
${params.join("\n")}

Follow the instructions below to complete the search. Return ALL flight results as a JSON object. Output ONLY the JSON -- no markdown fences, no explanation before or after.

${taskContent}`;
}

export async function executeSearch(target: SearchTarget, airlineId: string, dateMode: "mid" | "random" = "mid", fast = false): Promise<any> {
  const airline = getAirline(airlineId);
  if (!airline) throw new Error(`Airline not found: ${airlineId}`);

  const taskPath = getTaskPath(airline, target.searchMode as "points" | "dollars");
  if (!taskPath) throw new Error(`Airline ${airlineId} does not support ${target.searchMode} search`);

  const fullTaskPath = path.resolve(REPO_ROOT, taskPath);
  const taskContent = fs.readFileSync(fullTaskPath, "utf-8");
  const departureDate = pickDepartureDate(target, dateMode);
  const prompt = buildPrompt(target, taskContent, departureDate);

  console.log(`  Searching ${airline.name} for ${target.origin}→${target.destination} on ${departureDate}...`);

  const run = startRun(target.id, airlineId, departureDate);

  // Build MCP server (only if source is newer than dist)
  const mcpDir = path.join(REPO_ROOT, "phantom-mcp");
  if (mcpBuildStale(mcpDir)) {
    execFileSync("npm", ["run", "build", "--silent"], { cwd: mcpDir, stdio: "pipe" });
  }

  // Reuse existing Chrome if running (preserves login sessions), otherwise launch fresh
  const chromeRunning = (() => {
    try { execSync('pgrep -f "user-data-dir=.*phantom-chrome-profile"', { stdio: "ignore" }); return true; } catch (_) { return false; }
  })();
  if (!chromeRunning) {
    launchChrome();
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.error("  Reusing existing Chrome (session preserved)");
    // Clean up stale socket so MCP server can bind
    try { fs.unlinkSync("/tmp/phantom.sock"); } catch (_) {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // Run Claude with full conversation logging
  const logDir = path.join(REPO_ROOT, "tmp", "agent_logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${run.id}.jsonl`);

  let output: string;
  try {
    try {
      // Stream conversation log to file as it arrives (no memory buffering).
      // This avoids the ETIMEDOUT issue from spawnSync buffering 10MB+ of
      // stream-json output. The file is written incrementally.
      const claudeArgs = [
        "-p", "--permission-mode", "bypassPermissions",
        "--output-format", "stream-json", "--verbose",
      ];
      if (fast) {
        claudeArgs.push("--model", "haiku");
        console.error("  ⚡ Fast mode: using Haiku (testing only, not for production)");
      }
      claudeArgs.push(prompt);

      output = await new Promise<string>((resolve, reject) => {
        const logStream = fs.createWriteStream(logPath);
        const child = spawnChild("claude", claudeArgs, {
          cwd: REPO_ROOT,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let lastText = "";
        let lineBuf = "";
        let settled = false;

        function parseLine(line: string): void {
          if (!line) return;
          try {
            const event = JSON.parse(line);
            if (event.type === "result" && event.result?.text) {
              lastText = event.result.text;
            } else if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") lastText = block.text;
              }
            }
          } catch (_) { /* skip non-JSON lines from verbose output */ }
        }

        child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf-8");
          logStream.write(text);
          lineBuf += text;
          const lines = lineBuf.split("\n");
          lineBuf = lines.pop()!;
          for (const line of lines) parseLine(line);
        });

        child.stderr.on("data", (chunk: Buffer) => {
          process.stderr.write(chunk);
        });

        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          if (!settled) { settled = true; reject(new Error("Claude timed out after 600s")); }
        }, 600000);

        child.on("close", (code) => {
          clearTimeout(timer);
          if (lineBuf) parseLine(lineBuf);
          logStream.end();
          console.error(`  Agent log saved: ${logPath}`);
          if (!settled) {
            settled = true;
            if (code !== 0) reject(new Error(`Claude exited with code ${code}`));
            else resolve(lastText.trim());
          }
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          logStream.end();
          if (!settled) { settled = true; reject(err); }
        });
      });
    } finally {
      // Don't kill Chrome -- keep it alive to preserve login sessions
      // Only clean up the socket so next run can reconnect
      try { fs.unlinkSync("/tmp/phantom.sock"); } catch (_) {}
    }

    // Parse JSON from Claude's output
    const parsed = extractJson(output);
    const jsonStr = JSON.stringify(parsed);
    // Agents may use different keys: flights, outboundFlights, availableFlights, etc.
    const flightArrays = [parsed.flights, parsed.outboundFlights, parsed.availableFlights].filter(Array.isArray);
    const flightCount = flightArrays.reduce((sum, arr) => sum + arr.length, 0);

    saveResults(target.id, airlineId, departureDate, target.origin, target.destination, target.searchMode, jsonStr, flightCount);
    completeRun(run.id, flightCount);

    console.log(`  Found ${flightCount} flights.`);
    return parsed;
  } catch (err) {
    const msg = (err as Error).message;
    const status: RunStatus = msg.includes(CAPTCHA_SENTINEL) ? "captcha" : msg.includes(LOGIN_SENTINEL) ? "login_required" : "error";
    failRun(run.id, status, msg);
    throw err;
  }
}
