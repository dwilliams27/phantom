import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(__dirname, "../../tmp");

export function getChromeWindowId(): string {
  const result = execSync(`swift -e '
import Cocoa
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    if let owner = w["kCGWindowOwnerName"] as? String, owner == "Google Chrome",
       let layer = w["kCGWindowLayer"] as? Int, layer == 0 {
        print(w["kCGWindowNumber"]!)
        break
    }
}
'`, { encoding: "utf-8" }).trim();

  if (!result) throw new Error("Chrome window not found");
  return result;
}

export function captureWindow(): { base64: string; savedPath: string } {
  const windowId = getChromeWindowId();
  const tmpPath = `/tmp/phantom_shot_${crypto.randomUUID()}.png`;
  execFileSync("screencapture", ["-x", "-o", "-l", windowId, tmpPath]);
  const data = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  // Also save a persistent copy for auditing
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const savedPath = path.join(SCREENSHOT_DIR, `screenshot_${Date.now()}.png`);
  fs.writeFileSync(savedPath, data);

  return { base64: data.toString("base64"), savedPath };
}
