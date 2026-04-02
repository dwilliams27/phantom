import net from "net";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOCKET_PATH = "/tmp/phantom.sock";
const EVAL_DIR = path.resolve(__dirname, "../../phantom-extension/eval");

export class ExtensionClient {
  private socket: net.Socket | null = null;
  private server: net.Server | null = null;
  private pending = new Map<string, { resolve: (msg: any) => void; timer: NodeJS.Timeout }>();
  private counter = 1;
  private reloaded = false;
  private connectResolve: (() => void) | null = null;
  private connectionReady: Promise<void>;

  constructor() {
    this.connectionReady = new Promise((resolve) => {
      this.connectResolve = resolve;
    });
  }

  async listen(): Promise<void> {
    try { fs.unlinkSync(SOCKET_PATH); } catch (e: any) { if (e.code !== "ENOENT") throw e; }

    this.server = net.createServer((socket) => {
      console.error("[phantom-mcp] Extension connected");

      if (!this.reloaded) {
        this.reloaded = true;
        console.error("[phantom-mcp] Reloading extension...");
        this.setupSocket(socket);
        socket.write(JSON.stringify({ id: String(this.counter++), command: "reload_extension", params: {} }) + "\n");
      } else {
        this.socket = socket;
        this.setupSocket(socket);
        this.connectResolve?.();
        this.connectResolve = null;
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(SOCKET_PATH, () => {
        console.error(`[phantom-mcp] Listening on ${SOCKET_PATH}`);
        resolve();
      });
    });
  }

  private setupSocket(socket: net.Socket): void {
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.substring(0, idx);
        buffer = buffer.substring(idx + 1);
        if (line.length === 0) continue;
        const message = JSON.parse(line);
        const entry = this.pending.get(message.id);
        if (entry) {
          clearTimeout(entry.timer);
          entry.resolve(message);
          this.pending.delete(message.id);
        }
      }
    });

    socket.on("close", () => {
      console.error("[phantom-mcp] Extension disconnected");
      if (this.socket === socket) {
        this.socket = null;
        this.connectionReady = new Promise((resolve) => {
          this.connectResolve = resolve;
        });
        // Fail all in-flight commands immediately instead of waiting for timeout
        for (const [id, entry] of this.pending) {
          clearTimeout(entry.timer);
          entry.resolve({ id, error: "Socket closed while command was in-flight" });
        }
        this.pending.clear();
      }
      // After reload disconnect, trigger extension wake-up
      if (this.reloaded && !this.socket) {
        setTimeout(() => {
          try {
            execSync(`osascript -e 'tell application "Google Chrome" to set URL of active tab of front window to (URL of active tab of front window)'`, { stdio: "ignore" });
          } catch (err) {
            console.error("[phantom-mcp] AppleScript wake-up failed:", (err as Error).message);
            throw err;
          }
        }, 2000);
      }
    });

    socket.on("error", (err) => {
      console.error("[phantom-mcp] Socket error:", err.message);
      if (this.socket === socket) this.socket = null;
    });
  }

  async sendCommand(command: string, params: object = {}, timeoutMs = 30000): Promise<any> {
    await this.connectionReady;

    if (!this.socket || this.socket.destroyed) {
      throw new Error("Extension not connected");
    }

    return new Promise((resolve) => {
      const id = String(this.counter++);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ id, error: `Timeout after ${timeoutMs}ms waiting for ${command}` });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.socket!.write(JSON.stringify({ id, command, params }) + "\n");
    });
  }

  async evalScript(js: string): Promise<any> {
    fs.mkdirSync(EVAL_DIR, { recursive: true });
    const filename = `script_${crypto.randomUUID()}.js`;
    const filepath = path.join(EVAL_DIR, filename);
    const body = js.includes(";") ? js : `return ${js}`;
    const wrapped = `(() => {\n  try {\n    ${body};\n  } catch(e) {\n    return {__error: e.message, stack: e.stack};\n  }\n})();`;
    fs.writeFileSync(filepath, wrapped);
    const result = await this.sendCommand("evaluate_script", { scriptPath: `eval/${filename}` });
    try { fs.unlinkSync(filepath); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
    return result;
  }

  async close(): Promise<void> {
    if (this.socket) this.socket.destroy();
    if (this.server) this.server.close();
    try { fs.unlinkSync(SOCKET_PATH); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  }
}
