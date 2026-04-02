import { execFileSync, execSync } from "child_process";
import fs from "fs";
import crypto from "crypto";

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

export function captureWindow(): string {
  const windowId = getChromeWindowId();
  const tmpPath = `/tmp/phantom_shot_${crypto.randomUUID()}.png`;
  execFileSync("screencapture", ["-x", "-o", "-l", windowId, tmpPath]);
  const data = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  return data.toString("base64");
}
