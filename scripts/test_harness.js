#!/usr/bin/env node
"use strict";

const net = require("net");
const fs = require("fs");
const readline = require("readline");

const SOCKET_PATH = "/tmp/phantom.sock";

try { fs.unlinkSync(SOCKET_PATH); } catch (_) {}

let activeClient = null;
let msgCounter = 1;

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
      console.log("[harness] Received:", JSON.stringify(message));
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

  setTimeout(() => sendTestSequence(client), 500);
});

function sendMessage(client, message) {
  if (client.destroyed) return;
  client.write(JSON.stringify(message) + "\n");
  console.log("[harness] Sent:", JSON.stringify(message));
}

function sendTestSequence(client) {
  sendMessage(client, { id: String(msgCounter++), command: "ping", params: {} });

  setTimeout(() => sendMessage(client, { id: String(msgCounter++), command: "echo", params: { hello: "world" } }), 1000);

  setTimeout(() => sendMessage(client, { id: String(msgCounter++), command: "nonexistent", params: {} }), 2000);
}

server.listen(SOCKET_PATH, () => {
  console.log("[harness] Listening on " + SOCKET_PATH);
  console.log("[harness] Load/reload the Phantom extension in Chrome to trigger connection.");
  console.log("[harness] Commands: ping, echo <text>, quit");
  console.log("");
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  if (!activeClient) {
    console.log("[harness] No client connected");
    return;
  }
  const trimmed = line.trim();
  if (trimmed === "ping") {
    sendMessage(activeClient, { id: String(msgCounter++), command: "ping", params: {} });
  } else if (trimmed.startsWith("echo ")) {
    sendMessage(activeClient, { id: String(msgCounter++), command: "echo", params: { text: trimmed.substring(5) } });
  } else if (trimmed === "quit") {
    shutdown();
  } else {
    console.log("Commands: ping, echo <text>, quit");
  }
});

function shutdown() {
  console.log("[harness] Shutting down...");
  try { fs.unlinkSync(SOCKET_PATH); } catch (_) {}
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
