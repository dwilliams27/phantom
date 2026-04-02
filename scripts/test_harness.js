#!/usr/bin/env node
"use strict";

const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const SOCKET_PATH = "/tmp/phantom.sock";
const EVAL_DIR = path.join(__dirname, "..", "phantom-extension", "eval");
const INTERACTIVE = process.argv.includes("--interactive");

function wrapScript(js) {
  // Multi-statement scripts must include their own return; single expressions get auto-return
  const body = js.includes(";") ? js : `return ${js}`;
  return `(() => {\n  try {\n    ${body};\n  } catch(e) {\n    return {__error: e.message, stack: e.stack};\n  }\n})();`;
}

function writeEvalScript(js) {
  fs.mkdirSync(EVAL_DIR, { recursive: true });
  const filename = `script_${crypto.randomUUID()}.js`;
  const filepath = path.join(EVAL_DIR, filename);
  fs.writeFileSync(filepath, wrapScript(js));
  return { scriptPath: `eval/${filename}`, filepath };
}

function cleanupEvalScript(filepath) {
  try { fs.unlinkSync(filepath); } catch (e) { if (e.code !== "ENOENT") throw e; }
}

async function evalScript(client, js) {
  const { scriptPath, filepath } = writeEvalScript(js);
  const result = await sendCommand(client, "evaluate_script", { scriptPath });
  cleanupEvalScript(filepath);
  return result;
}

try { fs.unlinkSync(SOCKET_PATH); } catch (_) {}

let activeClient = null;
let msgCounter = 1;
const pendingResponses = new Map();
let testsPassed = 0;
let testsFailed = 0;
let reloaded = false;

function setupClient(client) {
  activeClient = client;
  let buffer = "";
  client.on("data", (chunk) => {
    buffer += chunk.toString("utf-8");
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.substring(0, idx);
      buffer = buffer.substring(idx + 1);
      if (line.length === 0) continue;
      const message = JSON.parse(line);
      if (pendingResponses.has(message.id)) {
        pendingResponses.get(message.id)(message);
        pendingResponses.delete(message.id);
      } else {
        console.log("[harness] Received:", JSON.stringify(message));
      }
    }
  });
  client.on("close", () => { console.log("[harness] Client disconnected"); activeClient = null; });
  client.on("error", (err) => { console.error("[harness] Client error:", err.message); activeClient = null; });
}

const server = net.createServer((client) => {
  console.log("[harness] Client connected");
  setupClient(client);

  if (!reloaded) {
    // First connection: reload extension to pick up latest code from disk
    reloaded = true;
    console.log("[harness] Reloading extension to pick up latest code...");
    sendCommand(client, "reload_extension").then(() => {
      console.log("[harness] Extension reloading, waiting for reconnect...");
      // After reload, service worker may not wake until an event fires.
      // Navigate a tab to trigger tabs.onUpdated which wakes it.
      setTimeout(() => {
        const { execSync } = require("child_process");
        execSync(`osascript -e 'tell application "Google Chrome" to set URL of active tab of front window to "https://example.com"'`, { stdio: "ignore" });
      }, 2000);
    });
  } else {
    // Second connection (post-reload): run tests
    runTests(client);
  }
});

function sendCommand(client, command, params = {}, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const id = String(msgCounter++);
    const timer = setTimeout(() => {
      pendingResponses.delete(id);
      resolve({ id, error: `Timeout after ${timeoutMs}ms waiting for ${command}` });
    }, timeoutMs);
    pendingResponses.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    if (client.destroyed) { clearTimeout(timer); resolve({ id, error: "client destroyed" }); return; }
    client.write(JSON.stringify({ id, command, params }) + "\n");
  });
}

function assert(name, condition, detail) {
  if (condition) {
    testsPassed++;
    console.log(`  PASS  ${name}`);
  } else {
    testsFailed++;
    console.log(`  FAIL  ${name}` + (detail ? ` -- ${detail}` : ""));
  }
}

async function runTests(client) {
  console.log("");
  console.log("Running e2e tests...");
  console.log("");

  // 1. Ping
  const ping = await sendCommand(client, "ping");
  assert("ping returns pong", ping.result?.pong === true);

  // 2. Echo
  const echo = await sendCommand(client, "echo", { hello: "world" });
  assert("echo returns params", echo.result?.echoed?.hello === "world");

  // 3. Unknown command returns error
  const unknown = await sendCommand(client, "nonexistent");
  assert("unknown command returns error", unknown.error?.includes("Unknown command"));

  // 4. List pages
  const tabs1 = await sendCommand(client, "list_pages");
  assert("list_pages returns tabs array", Array.isArray(tabs1.result?.tabs));
  assert("at least one tab exists", tabs1.result?.tabs?.length > 0);

  // 5. Navigate to first page (extension waits for load completion)
  const nav1 = await sendCommand(client, "navigate_page", { url: "https://example.com" });
  assert("navigate to example.com", nav1.result?.url?.includes("example.com"), JSON.stringify(nav1));

  // 6. Navigate to second page (creates back history)
  const nav2 = await sendCommand(client, "navigate_page", { url: "https://www.iana.org/domains/reserved" });
  assert("navigate to iana.org", nav2.result?.url?.includes("iana.org"), JSON.stringify(nav2));

  // go_back/go_forward: chrome.tabs.update() doesn't create history entries,
  // so we can't test successful navigation here. Verify the commands return
  // a structured error (not crash) when there's no history.
  const back = await sendCommand(client, "go_back");
  assert("go_back returns error when no history", typeof back.error === "string", JSON.stringify(back));
  const fwd = await sendCommand(client, "go_forward");
  assert("go_forward returns error when no history", typeof fwd.error === "string", JSON.stringify(fwd));

  // 8. Snapshot on example.com (navigate back first)
  await sendCommand(client, "navigate_page", { url: "https://example.com" });
  const snap = await sendCommand(client, "take_snapshot");
  if (snap.error) console.log("  [snapshot error]:", snap.error);
  if (snap.result?.tree) console.log("\n--- SNAPSHOT ---\n" + snap.result.tree + "\n--- END ---\n");
  assert("take_snapshot returns tree string", typeof snap.result?.tree === "string", JSON.stringify(snap).substring(0, 200));
  assert("take_snapshot returns refCount", typeof snap.result?.refCount === "number");
  assert("snapshot contains heading", snap.result?.tree?.includes('heading "Example Domain"'));
  assert("snapshot contains link with ref", snap.result?.tree?.match(/\[\d+\] link "/));
  assert("snapshot has refs", snap.result?.refCount > 0);

  // 9. get_element_rect on ref 0
  const rect = await sendCommand(client, "get_element_rect", { ref: 0 });
  assert("get_element_rect returns coordinates", typeof rect.result?.centerX === "number");
  assert("get_element_rect returns screenX", typeof rect.result?.screenX === "number");

  // 10. get_element_rect on invalid ref
  const badRect = await sendCommand(client, "get_element_rect", { ref: 9999 });
  assert("get_element_rect invalid ref returns error", typeof badRect.error === "string", JSON.stringify(badRect));

  // 11. evaluate_script: simple expression
  const evalTitle = await evalScript(client, "document.title");
  assert("evaluate_script returns document.title", evalTitle.result === "Example Domain", JSON.stringify(evalTitle));

  // 12. evaluate_script: DOM query returning array of objects
  const evalLinks = await evalScript(client, "Array.from(document.querySelectorAll('a')).map(a => ({text: a.textContent, href: a.href}))");
  assert("evaluate_script returns link array", Array.isArray(evalLinks.result) && evalLinks.result.length > 0, JSON.stringify(evalLinks));

  // 13. evaluate_script: script that throws
  const evalError = await evalScript(client, "(() => { throw new Error('test error'); })()");
  assert("evaluate_script error returns __error", typeof evalError.error === "string" && evalError.error.includes("test error"), JSON.stringify(evalError));

  // 14. check_page_status on example.com (no login, no captcha, no error)
  const status = await sendCommand(client, "check_page_status");
  assert("check_page_status returns url", status.result?.url?.includes("example.com"), JSON.stringify(status));
  assert("check_page_status no login form", status.result?.hasLoginForm === false);
  assert("check_page_status no captcha", status.result?.hasCaptcha === false);
  assert("check_page_status no error", status.result?.hasError === false);

  // 15. wait_for with selector that exists immediately
  const waitFound = await sendCommand(client, "wait_for", { selector: "h1", timeout: 3000 });
  assert("wait_for finds existing selector", waitFound.result?.found === true, JSON.stringify(waitFound));

  // 16. wait_for with text that exists
  const waitText = await sendCommand(client, "wait_for", { text: "Example Domain", timeout: 3000 });
  assert("wait_for finds existing text", waitText.result?.found === true, JSON.stringify(waitText));

  // 17. wait_for with selector that doesn't exist (short timeout)
  const waitMissing = await sendCommand(client, "wait_for", { selector: ".nonexistent", timeout: 1500 }, 15000);
  assert("wait_for times out on missing selector", waitMissing.result?.found === false, JSON.stringify(waitMissing));

  // 18. Interactive command parsing (exercises the same paths as readline dispatch)
  const interactiveTests = [
    { input: "ping", expected: { command: "ping" } },
    { input: "tabs", expected: { command: "list_pages" } },
    { input: "nav https://example.com", expected: { command: "navigate_page", params: { url: "https://example.com" } } },
    { input: "back", expected: { command: "go_back" } },
    { input: "forward", expected: { command: "go_forward" } },
    { input: "echo hello world", expected: { command: "echo", params: { text: "hello world" } } },
    { input: "snapshot", expected: { command: "take_snapshot" } },
    { input: "rect 5", expected: { command: "get_element_rect", params: { ref: 5 } } },
    { input: "eval document.title", expected: { command: "eval", params: { js: "document.title" } } },
    { input: "status", expected: { command: "check_page_status" } },
    { input: "wait h1", expected: { command: "wait_for", params: { selector: "h1" } } },
    { input: "waittext Example", expected: { command: "wait_for", params: { text: "Example" } } },
  ];
  for (const { input, expected } of interactiveTests) {
    const parsed = parseInteractiveCommand(input);
    assert(`interactive "${input}" parses correctly`,
      parsed.command === expected.command && (!expected.params || JSON.stringify(parsed.params) === JSON.stringify(expected.params)),
      JSON.stringify(parsed));
  }

  // Summary
  console.log("");
  console.log("============================================");
  console.log(`  ${testsPassed} passed, ${testsFailed} failed`);
  console.log("============================================");
  console.log("");

  if (INTERACTIVE) {
    console.log("Entering interactive mode. Commands: ping, echo <text>, tabs, nav <url>, back, forward, snapshot, rect <N>, eval <js>, status, wait <selector>, waittext <text>, quit");
  } else {
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

server.listen(SOCKET_PATH, () => {
  console.log("[harness] Listening on " + SOCKET_PATH);
  console.log("[harness] Waiting for extension to connect...");
  console.log("");
});

function parseInteractiveCommand(input) {
  const trimmed = input.trim();
  if (trimmed === "ping") return { command: "ping" };
  if (trimmed.startsWith("echo ")) return { command: "echo", params: { text: trimmed.substring(5) } };
  if (trimmed === "tabs") return { command: "list_pages" };
  if (trimmed.startsWith("nav ")) return { command: "navigate_page", params: { url: trimmed.substring(4) } };
  if (trimmed === "back") return { command: "go_back" };
  if (trimmed === "forward") return { command: "go_forward" };
  if (trimmed === "snapshot") return { command: "take_snapshot" };
  if (trimmed.startsWith("rect ")) return { command: "get_element_rect", params: { ref: parseInt(trimmed.substring(5), 10) } };
  if (trimmed.startsWith("eval ")) return { command: "eval", params: { js: trimmed.substring(5) } };
  if (trimmed === "status") return { command: "check_page_status" };
  if (trimmed.startsWith("wait ")) return { command: "wait_for", params: { selector: trimmed.substring(5) } };
  if (trimmed.startsWith("waittext ")) return { command: "wait_for", params: { text: trimmed.substring(9) } };
  if (trimmed === "quit") return { command: "quit" };
  return null;
}

if (INTERACTIVE) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line) => {
    if (!activeClient) { console.log("[harness] No client connected"); return; }
    const parsed = parseInteractiveCommand(line);
    if (!parsed) { console.log("Commands: ping, echo <text>, tabs, nav <url>, back, forward, snapshot, rect <N>, eval <js>, status, wait <selector>, waittext <text>, quit"); return; }
    if (parsed.command === "quit") { shutdown(); return; }
    if (parsed.command === "eval") {
      evalScript(activeClient, parsed.params.js).then(r => console.log("  =>", JSON.stringify(r.result ?? r.error)));
    } else if (parsed.command === "take_snapshot") {
      sendCommand(activeClient, parsed.command).then(r => {
        if (r.result?.tree) { console.log("\n" + r.result.tree + "\n"); console.log(`(${r.result.refCount} refs)`); }
        else console.log("  =>", JSON.stringify(r));
      });
    } else {
      sendCommand(activeClient, parsed.command, parsed.params).then(r => console.log("  =>", JSON.stringify(r)));
    }
  });
}

function shutdown() {
  try { fs.unlinkSync(SOCKET_PATH); } catch (_) {}
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
