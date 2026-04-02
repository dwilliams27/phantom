import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ExtensionClient } from "./extension-client.js";

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

// --- Start ---

async function main() {
  await extensionClient.listen();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[phantom-mcp] Server running on stdio");
}

main();
