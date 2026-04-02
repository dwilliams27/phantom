const NM_HOST = "com.phantom.mcp";
const KEEPALIVE_INTERVAL_MS = 25000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const NAV_TIMEOUT_MS = 30000;

let port = null;
let keepaliveTimer = null;
let reconnectAttempt = 0;
let reconnecting = false;

function connect() {
  reconnecting = false;
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
  if (reconnecting) return;
  reconnecting = true;
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
  reconnectAttempt++;
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
  setTimeout(connect, delay);
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const onUpdated = (tid, info, t) => {
      if (tid === tabId && info.status === "complete") {
        done();
        resolve(t);
      }
    };
    const onRemoved = (tid) => {
      if (tid === tabId) {
        done();
        reject(new Error(`Tab ${tabId} closed during navigation`));
      }
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error(`Navigation timed out after ${NAV_TIMEOUT_MS}ms`));
    }, NAV_TIMEOUT_MS);

    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function handleCommand(message) {
  const { id, command, params } = message;

  try { switch (command) {
    case "ping":
      port.postMessage({ id, result: { pong: true } });
      break;

    case "echo":
      port.postMessage({ id, result: { echoed: params } });
      break;

    case "list_pages": {
      const tabs = await chrome.tabs.query({});
      port.postMessage({ id, result: { tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active, status: t.status })) } });
      break;
    }

    case "navigate_page": {
      const tabId = params.tabId || await getActiveTabId();
      await chrome.tabs.update(tabId, { url: params.url });
      const tab = await waitForTabLoad(tabId);
      port.postMessage({ id, result: { tabId: tab.id, url: tab.url } });
      break;
    }

    case "go_back": {
      const tabId = params.tabId || await getActiveTabId();
      await chrome.tabs.goBack(tabId);
      port.postMessage({ id, result: { tabId, success: true } });
      break;
    }

    case "go_forward": {
      const tabId = params.tabId || await getActiveTabId();
      await chrome.tabs.goForward(tabId);
      port.postMessage({ id, result: { tabId, success: true } });
      break;
    }

    case "select_page": {
      const tab = await chrome.tabs.update(params.tabId, { active: true });
      port.postMessage({ id, result: { tabId: tab.id } });
      break;
    }

    case "reload_extension": {
      port.postMessage({ id, result: { reloading: true } });
      chrome.runtime.reload();
      break;
    }

    case "take_snapshot": {
      const tabId = params.tabId || await getActiveTabId();
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "ISOLATED",
        files: ["snapshot.js"],
      });
      port.postMessage({ id, result: result.result });
      break;
    }

    case "get_element_rect": {
      const tabId = params.tabId || await getActiveTabId();
      const ref = params.ref;
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "ISOLATED",
        func: (ref) => {
          const el = globalThis.__phantom_refs?.get(ref);
          if (!el) return { __error: `Ref ${ref} not found` };
          if (!el.isConnected) return { __error: `Ref ${ref} detached from DOM` };
          const rect = el.getBoundingClientRect();
          return {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2,
            screenX: window.screenX + rect.x,
            screenY: window.screenY + (window.outerHeight - window.innerHeight) + rect.y,
          };
        },
        args: [ref],
      });
      const val = result.result;
      if (val?.__error) {
        port.postMessage({ id, error: val.__error });
      } else {
        port.postMessage({ id, result: val });
      }
      break;
    }

    default:
      port.postMessage({ id, error: `Unknown command: ${command}` });
      break;
  } } catch (err) {
    port.postMessage({ id, error: err.message });
  }
}

// Connect on every event that can wake the service worker
connect();
chrome.runtime.onStartup.addListener(() => { if (!port && !reconnecting) connect(); });
chrome.runtime.onInstalled.addListener(() => { if (!port && !reconnecting) connect(); });
chrome.tabs.onUpdated.addListener(() => { if (!port && !reconnecting) connect(); });
