import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, "../../tmp");

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getChromeWindowInfo(): { id: string; bounds: WindowBounds } {
  const result = execSync(`swift -e '
import Cocoa
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    if let owner = w["kCGWindowOwnerName"] as? String, owner == "Google Chrome",
       let layer = w["kCGWindowLayer"] as? Int, layer == 0,
       let bounds = w["kCGWindowBounds"] as? [String: Any] {
        let wid = w["kCGWindowNumber"]!
        let x = bounds["X"] as! Int
        let y = bounds["Y"] as! Int
        let width = bounds["Width"] as! Int
        let height = bounds["Height"] as! Int
        print("\\(wid),\\(x),\\(y),\\(width),\\(height)")
        break
    }
}
'`, { encoding: "utf-8" }).trim();

  if (!result) throw new Error("Chrome window not found");
  const [id, x, y, width, height] = result.split(",");
  return {
    id,
    bounds: { x: parseInt(x, 10), y: parseInt(y, 10), width: parseInt(width, 10), height: parseInt(height, 10) },
  };
}

export function getChromeWindowId(): string {
  return getChromeWindowInfo().id;
}

export function getChromeWindowBounds(): WindowBounds {
  return getChromeWindowInfo().bounds;
}

export function captureWindow(): { base64: string; savedPath: string } {
  const { id: windowId } = getChromeWindowInfo();
  const tmpPath = `/tmp/phantom_shot_${crypto.randomUUID()}.png`;
  execFileSync("screencapture", ["-x", "-o", "-l", windowId, tmpPath]);
  const data = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const savedPath = path.join(SCREENSHOT_DIR, `screenshot_${Date.now()}.png`);
  fs.writeFileSync(savedPath, data);

  return { base64: data.toString("base64"), savedPath };
}
