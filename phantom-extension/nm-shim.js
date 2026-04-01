#!/usr/bin/env node
"use strict";

const net = require("net");
const SOCKET_PATH = "/tmp/phantom.sock";
const MAX_NM_MESSAGE = 1024 * 1024;

let stdinBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
  processStdinBuffer();
});

function processStdinBuffer() {
  while (true) {
    if (stdinBuffer.length < 4) return;
    const msgLen = stdinBuffer.readUInt32LE(0);
    if (stdinBuffer.length < 4 + msgLen) return;
    const jsonBuf = stdinBuffer.subarray(4, 4 + msgLen);
    stdinBuffer = stdinBuffer.subarray(4 + msgLen);
    const message = JSON.parse(jsonBuf.toString("utf-8"));
    handleFromExtension(message);
  }
}

function writeToExtension(message) {
  const json = JSON.stringify(message);
  const buf = Buffer.from(json, "utf-8");
  if (buf.length > MAX_NM_MESSAGE) {
    console.error("[nm-shim] Message exceeds 1MB NM limit: " + buf.length + " bytes");
    process.exit(1);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

let socketBuffer = "";
const socket = net.createConnection(SOCKET_PATH);

socket.on("connect", () => {
  console.error("[nm-shim] Connected to " + SOCKET_PATH);
});

socket.on("data", (chunk) => {
  socketBuffer += chunk.toString("utf-8");
  let idx;
  while ((idx = socketBuffer.indexOf("\n")) !== -1) {
    const line = socketBuffer.substring(0, idx);
    socketBuffer = socketBuffer.substring(idx + 1);
    if (line.length === 0) continue;
    const message = JSON.parse(line);
    writeToExtension(message);
  }
});

function writeToServer(message) {
  socket.write(JSON.stringify(message) + "\n");
}

function handleFromExtension(message) {
  if (message.command === "keepalive") {
    writeToExtension({ keepalive: true });
    return;
  }
  writeToServer(message);
}

socket.on("error", (err) => {
  console.error("[nm-shim] Socket error: " + err.message);
  process.exit(1);
});

socket.on("close", () => {
  console.error("[nm-shim] Socket closed");
  process.exit(1);
});

process.stdin.on("end", () => {
  console.error("[nm-shim] stdin closed (Chrome disconnected)");
  socket.end();
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("[nm-shim] Uncaught exception: " + err.message);
  process.exit(1);
});
