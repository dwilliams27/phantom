import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ExtensionClient } from "./extension-client.js";
import * as cliclick from "./cliclick.js";
import * as screencapture from "./screencapture.js";

const extensionClient = new ExtensionClient();

const server = new McpServer({
  name: "phantom-mcp",
  version: "1.0.0",
});

const optionalTabId = z.number().optional().describe("Tab ID (defaults to active tab)");

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

async function callExtension(command: string, params: object = {}) {
  const result = await extensionClient.sendCommand(command, params);
  if (result.error) return errorResult(result.error);
  return textResult(JSON.stringify(result.result));
}

// --- Connectivity ---

server.registerTool("ping", {
  description: "Ping the Phantom extension to verify connectivity",
  inputSchema: {},
}, () => callExtension("ping"));

// --- Navigation ---

server.registerTool("navigate_page", {
  description: "Navigate a tab to a URL. Waits for page load to complete.",
  inputSchema: {
    url: z.string().describe("URL to navigate to"),
    tabId: optionalTabId,
  },
}, ({ url, tabId }) => callExtension("navigate_page", { url, tabId }));

server.registerTool("go_back", {
  description: "Navigate a tab back in history",
  inputSchema: { tabId: optionalTabId },
}, ({ tabId }) => callExtension("go_back", { tabId }));

server.registerTool("go_forward", {
  description: "Navigate a tab forward in history",
  inputSchema: { tabId: optionalTabId },
}, ({ tabId }) => callExtension("go_forward", { tabId }));

server.registerTool("list_pages", {
  description: "List all open tabs with their IDs, titles, URLs, and active status",
  inputSchema: {},
}, () => callExtension("list_pages"));

server.registerTool("select_page", {
  description: "Switch to a specific tab by its ID",
  inputSchema: { tabId: z.number().describe("Tab ID from list_pages") },
}, ({ tabId }) => callExtension("select_page", { tabId }));

// --- Observation ---

server.registerTool("take_snapshot", {
  description: "Capture an accessibility tree snapshot of the current page. Returns a text tree with [N] refs for interactive elements that can be used with click, fill, and get_element_rect.",
  inputSchema: { tabId: optionalTabId },
}, async ({ tabId }) => {
  const result = await extensionClient.sendCommand("take_snapshot", { tabId });
  if (result.error) return errorResult(result.error);
  return textResult(`${result.result.tree}\n\n(${result.result.refCount} interactive refs)`);
});

server.registerTool("get_element_rect", {
  description: "Get the bounding rectangle and screen coordinates of an element by its ref from the last snapshot",
  inputSchema: {
    ref: z.number().describe("Element ref number from take_snapshot"),
    tabId: optionalTabId,
  },
}, ({ ref, tabId }) => callExtension("get_element_rect", { ref, tabId }));

server.registerTool("take_screenshot", {
  description: "Capture a screenshot of the Chrome window. Returns a PNG image for visual context.",
  inputSchema: {},
}, () => {
  const { base64, savedPath } = screencapture.captureWindow();
  console.error(`[phantom-mcp] Screenshot saved: ${savedPath}`);
  return { content: [{ type: "image" as const, data: base64, mimeType: "image/png" as const }] };
});

// --- Evaluation ---

server.registerTool("evaluate_script", {
  description: "Execute arbitrary JavaScript in the page's ISOLATED world. Has full DOM access but cannot see page-defined JS variables. Return value must be JSON-serializable.",
  inputSchema: { js: z.string().describe("JavaScript to execute. Single expressions auto-return; multi-statement scripts must include explicit return.") },
}, async ({ js }) => {
  const result = await extensionClient.evalScript(js);
  if (result.error) return errorResult(result.error);
  return textResult(JSON.stringify(result.result));
});

server.registerTool("wait_for", {
  description: "Wait for a CSS selector or text to appear on the page. Polls every 500ms. At least one of selector or text must be provided.",
  inputSchema: {
    selector: z.string().optional().describe("CSS selector to wait for"),
    text: z.string().optional().describe("Text content to wait for"),
    timeout: z.number().optional().describe("Timeout in ms (default 10000)"),
    tabId: optionalTabId,
  },
}, ({ selector, text, timeout, tabId }) => callExtension("wait_for", { selector, text, timeout, tabId }));

// --- Health ---

server.registerTool("check_page_status", {
  description: "Check page health: detects login forms, CAPTCHAs, and error states",
  inputSchema: { tabId: optionalTabId },
}, ({ tabId }) => callExtension("check_page_status", { tabId }));

// --- Interaction ---

async function getScreenCenter(ref: number, tabId?: number) {
  const result = await extensionClient.sendCommand("get_element_rect", { ref, tabId });
  if (result.error) throw new Error(result.error);
  const r = result.result;
  // screenX/screenY are screen coords of element's top-left; add half width/height for center
  return { x: r.screenX + r.width / 2, y: r.screenY + r.height / 2 };
}

server.registerTool("click", {
  description: "Click an element by its ref from the last snapshot. Moves the mouse naturally then clicks.",
  inputSchema: {
    ref: z.number().describe("Element ref number from take_snapshot"),
    tabId: optionalTabId,
  },
}, async ({ ref, tabId }) => {
  const center = await getScreenCenter(ref, tabId);
  cliclick.moveTo(center.x, center.y);
  await new Promise(r => setTimeout(r, 50));
  const result = cliclick.click(center.x, center.y);
  const msg = `Clicked element [${ref}]`;
  return textResult(result.wasClamped ? `${msg} (WARNING: coordinates were outside Chrome window and were clamped to the nearest edge. The element may be off-screen -- try scrolling first.)` : msg);
});

server.registerTool("click_at", {
  description: "Click at specific screen coordinates. Use when the target element is not in the snapshot (e.g., canvas-rendered UI).",
  inputSchema: {
    x: z.number().describe("Screen X coordinate"),
    y: z.number().describe("Screen Y coordinate"),
  },
}, async ({ x, y }) => {
  cliclick.moveTo(x, y);
  await new Promise(r => setTimeout(r, 50));
  const result = cliclick.click(x, y);
  const msg = `Clicked at (${x}, ${y})`;
  return textResult(result.wasClamped ? `${msg} (WARNING: coordinates were outside Chrome window and were clamped. The target may be off-screen.)` : msg);
});

server.registerTool("mouse_move", {
  description: "Move the mouse cursor to specific screen coordinates with natural easing",
  inputSchema: {
    x: z.number().describe("Screen X coordinate"),
    y: z.number().describe("Screen Y coordinate"),
  },
}, ({ x, y }) => {
  cliclick.moveTo(x, y);
  return textResult(`Moved mouse to (${x}, ${y})`);
});

server.registerTool("fill", {
  description: "Fill a form field by ref: clicks to focus, selects all existing text, then types the new value",
  inputSchema: {
    ref: z.number().describe("Element ref number from take_snapshot"),
    value: z.string().describe("Text to fill into the field"),
    tabId: optionalTabId,
  },
}, async ({ ref, value, tabId }) => {
  const center = await getScreenCenter(ref, tabId);
  cliclick.click(center.x, center.y);
  await new Promise(r => setTimeout(r, 100));
  cliclick.selectAll();
  await new Promise(r => setTimeout(r, 200));
  cliclick.typeText(value);
  return textResult(`Filled element [${ref}] with "${value}"`);
});

server.registerTool("type_text", {
  description: "Type text into the currently focused element",
  inputSchema: { text: z.string().describe("Text to type") },
}, ({ text }) => {
  cliclick.typeText(text);
  return textResult(`Typed "${text}"`);
});

server.registerTool("press_key", {
  description: "Press a key or key combination. Examples: Enter, Tab, Escape, ArrowDown, Control+A, Command+C",
  inputSchema: { key: z.string().describe("Key name or combo like 'Enter', 'Tab', 'Control+A'") },
}, ({ key }) => {
  cliclick.pressKey(key);
  return textResult(`Pressed ${key}`);
});

server.registerTool("scroll", {
  description: "Scroll the page up or down using arrow key simulation. If a form input has focus, click the page body first to ensure scrolling affects the page rather than the input.",
  inputSchema: {
    direction: z.enum(["up", "down"]).describe("Scroll direction"),
    amount: z.number().optional().describe("Number of pages to scroll (default 1)"),
  },
}, ({ direction, amount }) => {
  cliclick.scroll(direction, amount);
  return textResult(`Scrolled ${direction}${amount ? ` ${amount} pages` : ""}`);
});

// --- Start ---

async function main() {
  await extensionClient.listen();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[phantom-mcp] Server running on stdio");
}

main();
