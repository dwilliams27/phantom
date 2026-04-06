import { execFileSync } from "child_process";
import { getChromeWindowBounds } from "./screencapture.js";
import type { WindowBounds } from "./screencapture.js";

const KEY_MAP: Record<string, string> = {
  enter: "return", return: "return",
  tab: "tab",
  escape: "esc", esc: "esc",
  space: "space",
  backspace: "delete",
  delete: "fwd-delete",
  arrowup: "arrow-up", arrowdown: "arrow-down",
  arrowleft: "arrow-left", arrowright: "arrow-right",
  pageup: "page-up", pagedown: "page-down",
  home: "home", end: "end",
};

const MODIFIER_MAP: Record<string, string> = {
  control: "ctrl", ctrl: "ctrl",
  command: "cmd", cmd: "cmd", meta: "cmd",
  alt: "alt", option: "alt",
  shift: "shift",
};

const MAX_SCROLL = 20;

let cachedBounds: WindowBounds | null = null;
let boundsAge = 0;
const BOUNDS_MAX_AGE_MS = 10000;

function getWindowBounds(): WindowBounds {
  const now = Date.now();
  if (!cachedBounds || now - boundsAge > BOUNDS_MAX_AGE_MS) {
    cachedBounds = getChromeWindowBounds();
    boundsAge = now;
  }
  return cachedBounds;
}

export interface ClampResult {
  x: number;
  y: number;
  wasClamped: boolean;
}

// Chrome header height (tab bar + address bar). Clicks above this within the
// window would hit browser UI, not the page viewport. Clamp to viewport only.
const CHROME_HEADER_HEIGHT = 96;

function clamp(x: number, y: number): ClampResult {
  const b = getWindowBounds();
  const margin = 5;
  const viewportTop = b.y + CHROME_HEADER_HEIGHT;
  const cx = Math.round(Math.max(b.x + margin, Math.min(x, b.x + b.width - margin)));
  const cy = Math.round(Math.max(viewportTop + margin, Math.min(y, b.y + b.height - margin)));
  const wasClamped = cx !== Math.round(x) || cy !== Math.round(y);
  if (wasClamped) {
    console.error(`[cliclick] Coordinates clamped: (${Math.round(x)},${Math.round(y)}) → (${cx},${cy}) [viewport: ${b.x},${viewportTop} ${b.width}x${b.height - CHROME_HEADER_HEIGHT}]`);
  }
  return { x: cx, y: cy, wasClamped };
}

function run(...args: string[]): void {
  execFileSync("cliclick", args, { stdio: "pipe" });
}

export function click(x: number, y: number): ClampResult {
  const c = clamp(x, y);
  run(`c:${c.x},${c.y}`);
  return c;
}

export function moveTo(x: number, y: number, easing = 20): ClampResult {
  const c = clamp(x, y);
  run(`-e`, String(easing), `m:${c.x},${c.y}`);
  return c;
}

export function typeText(text: string): void {
  run(`t:${text}`);
}

export function selectAll(): void {
  // w:100 between cmd-up and next command prevents macOS from
  // interpreting the rapid cmd tap as a dictation trigger
  run("kd:cmd", "t:a", "ku:cmd", "w:100");
}

export function pressKey(key: string): void {
  const parts = key.split("+").map(p => p.trim());
  if (parts.length > 1) {
    const modifiers = parts.slice(0, -1).map(m => MODIFIER_MAP[m.toLowerCase()] || m.toLowerCase());
    const mainKey = parts[parts.length - 1];
    const modStr = modifiers.join(",");
    const mapped = KEY_MAP[mainKey.toLowerCase()];
    if (mapped) {
      run(`kd:${modStr}`, `kp:${mapped}`, `ku:${modStr}`);
    } else if (mainKey.length === 1) {
      run(`kd:${modStr}`, `t:${mainKey.toLowerCase()}`, `ku:${modStr}`);
    } else {
      run(`kd:${modStr}`, `kp:${mainKey.toLowerCase()}`, `ku:${modStr}`);
    }
    return;
  }

  const mapped = KEY_MAP[key.toLowerCase()];
  if (mapped) {
    run(`kp:${mapped}`);
  } else if (key.length === 1) {
    run(`t:${key}`);
  } else {
    run(`kp:${key.toLowerCase()}`);
  }
}

// Each "amount" = ~half a viewport scroll (10 arrow key presses ≈ half page)
const ARROWS_PER_SCROLL = 5;

export function scroll(direction: "up" | "down", amount = 1): void {
  const count = Math.min(Math.max(1, amount), MAX_SCROLL);
  const key = direction === "down" ? "arrow-down" : "arrow-up";
  const totalArrows = count * ARROWS_PER_SCROLL;
  const args = Array.from({ length: totalArrows }, () => `kp:${key}`);
  run(...args);
}

