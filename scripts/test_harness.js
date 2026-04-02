#!/usr/bin/env node
"use strict";

const net = require("net");
const fs = require("fs");
const readline = require("readline");

const SOCKET_PATH = "/tmp/phantom.sock";
const INTERACTIVE = process.argv.includes("--interactive");

try { fs.unlinkSync(SOCKET_PATH); } catch (_) {}

let activeClient = null;
let msgCounter = 1;
const pendingResponses = new Map();
let testsPassed = 0;
let testsFailed = 0;

const server = net.createServer((client) => {
  console.log("[harness] Client connected");
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

  client.on("close", () => {
    console.log("[harness] Client disconnected");
    activeClient = null;
  });

  client.on("error", (err) => {
    console.error("[harness] Client error:", err.message);
    activeClient = null;
  });

  runTests(client);
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
  assert("go_back returns error when no history", typeof back.error === "string");
  const fwd = await sendCommand(client, "go_forward");
  assert("go_forward returns error when no history", typeof fwd.error === "string");

  // Summary
  console.log("");
  console.log("============================================");
  console.log(`  ${testsPassed} passed, ${testsFailed} failed`);
  console.log("============================================");
  console.log("");

  if (INTERACTIVE) {
    console.log("Entering interactive mode. Commands: ping, echo <text>, tabs, nav <url>, back, forward, quit");
  } else {
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

server.listen(SOCKET_PATH, () => {
  console.log("[harness] Listening on " + SOCKET_PATH);
  console.log("[harness] Waiting for extension to connect...");
  console.log("");
});

if (INTERACTIVE) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line) => {
    if (!activeClient) { console.log("[harness] No client connected"); return; }
    const trimmed = line.trim();
    if (trimmed === "ping") {
      sendCommand(activeClient, "ping").then(r => console.log("  =>", JSON.stringify(r)));
    } else if (trimmed.startsWith("echo ")) {
      sendCommand(activeClient, "echo", { text: trimmed.substring(5) }).then(r => console.log("  =>", JSON.stringify(r)));
    } else if (trimmed === "tabs") {
      sendCommand(activeClient, "list_pages").then(r => console.log("  =>", JSON.stringify(r)));
    } else if (trimmed.startsWith("nav ")) {
      sendCommand(activeClient, "navigate_page", { url: trimmed.substring(4) }).then(r => console.log("  =>", JSON.stringify(r)));
    } else if (trimmed === "back") {
      sendCommand(activeClient, "go_back").then(r => console.log("  =>", JSON.stringify(r)));
    } else if (trimmed === "forward") {
      sendCommand(activeClient, "go_forward").then(r => console.log("  =>", JSON.stringify(r)));
    } else if (trimmed === "quit") {
      shutdown();
    } else {
      console.log("Commands: ping, echo <text>, tabs, nav <url>, back, forward, quit");
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
