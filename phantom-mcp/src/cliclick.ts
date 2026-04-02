import { execFileSync } from "child_process";

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

function run(...args: string[]): void {
  execFileSync("cliclick", args, { stdio: "pipe" });
}

export function click(x: number, y: number): void {
  run(`c:${Math.round(x)},${Math.round(y)}`);
}

export function moveTo(x: number, y: number, easing = 20): void {
  run(`-e`, String(easing), `m:${Math.round(x)},${Math.round(y)}`);
}

export function typeText(text: string): void {
  run(`t:${text}`);
}

export function selectAll(): void {
  run("kd:cmd", "t:a", "ku:cmd");
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

export function scroll(direction: "up" | "down", amount = 1): void {
  const count = Math.min(Math.max(1, amount), MAX_SCROLL);
  const key = direction === "down" ? "page-down" : "page-up";
  const args = Array.from({ length: count }, () => `kp:${key}`);
  run(...args);
}
