const NM_HOST = "com.phantom.mcp";
const KEEPALIVE_INTERVAL_MS = 25000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

let port = null;
let keepaliveTimer = null;
let reconnectAttempt = 0;

function connect() {
  console.log("Initiating NM connection...");
  port = chrome.runtime.connectNative(NM_HOST);

  port.onMessage.addListener((message) => {
    if (message.keepalive) return;

    if (!message.id || !message.command) {
      console.error("Invalid message (missing id or command):", JSON.stringify(message));
      return;
    }

    handleCommand(message);
  });

  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || "unknown";
    console.error(`NM port disconnected: ${error}`);
    cleanup();
    scheduleReconnect();
  });

  reconnectAttempt = 0;

  keepaliveTimer = setInterval(() => {
    if (port) port.postMessage({ command: "keepalive" });
  }, KEEPALIVE_INTERVAL_MS);
}

function cleanup() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  port = null;
}

function scheduleReconnect() {
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
  reconnectAttempt++;
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
  setTimeout(connect, delay);
}

function handleCommand(message) {
  const { id, command, params } = message;

  switch (command) {
    case "ping":
      port.postMessage({ id, result: { pong: true } });
      break;

    case "echo":
      port.postMessage({ id, result: { echoed: params } });
      break;

    default:
      port.postMessage({ id, error: `Unknown command: ${command}` });
      break;
  }
}

connect();
