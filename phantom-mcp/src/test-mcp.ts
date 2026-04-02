import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function getText(result: any): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
}

function parseResult(result: any): any {
  return JSON.parse(getText(result));
}

async function main() {
  console.log("");
  console.log("Running MCP e2e tests...");
  console.log("");

  const transport = new StdioClientTransport({
    command: "node",
    args: [new URL("./index.js", import.meta.url).pathname],
  });

  const client = new Client({ name: "phantom-test", version: "1.0.0" });
  await client.connect(transport);

  try {
    // 1. Tool discovery
    const { tools } = await client.listTools();
    assert("tools registered", tools.length >= 11, `got ${tools.length} tools`);
    assert("ping tool exists", tools.some(t => t.name === "ping"));
    assert("take_snapshot tool exists", tools.some(t => t.name === "take_snapshot"));
    assert("navigate_page tool exists", tools.some(t => t.name === "navigate_page"));

    // 2. Ping
    const ping = await client.callTool({ name: "ping", arguments: {} });
    assert("ping returns pong", getText(ping).includes("pong"));

    // 3. List pages
    const pages = await client.callTool({ name: "list_pages", arguments: {} });
    const tabs = parseResult(pages).tabs;
    assert("list_pages returns tabs", Array.isArray(tabs) && tabs.length > 0);

    // 4. Navigate
    const nav = await client.callTool({ name: "navigate_page", arguments: { url: "https://example.com" } });
    const navResult = parseResult(nav);
    assert("navigate_page returns url", navResult.url?.includes("example.com"), getText(nav));

    // 5. Snapshot
    const snap = await client.callTool({ name: "take_snapshot", arguments: {} });
    const snapText = getText(snap);
    assert("take_snapshot returns tree", snapText.includes("RootWebArea"));
    assert("snapshot contains heading", snapText.includes('heading "Example Domain"'));
    assert("snapshot contains ref", snapText.match(/\[\d+\]/) !== null);
    assert("snapshot contains refCount", snapText.includes("interactive refs"));

    // 6. get_element_rect
    const rect = await client.callTool({ name: "get_element_rect", arguments: { ref: 0 } });
    const rectResult = parseResult(rect);
    assert("get_element_rect returns centerX", typeof rectResult.centerX === "number");
    assert("get_element_rect returns screenX", typeof rectResult.screenX === "number");

    // 7. evaluate_script
    const evalResult = await client.callTool({ name: "evaluate_script", arguments: { js: "document.title" } });
    assert("evaluate_script returns title", getText(evalResult).includes("Example Domain"), getText(evalResult));

    // 8. check_page_status
    const status = await client.callTool({ name: "check_page_status", arguments: {} });
    const statusResult = parseResult(status);
    assert("check_page_status returns url", statusResult.url?.includes("example.com"));
    assert("check_page_status no login", statusResult.hasLoginForm === false);
    assert("check_page_status no captcha", statusResult.hasCaptcha === false);

    // 9. wait_for
    const waitResult = await client.callTool({ name: "wait_for", arguments: { selector: "h1", timeout: 3000 } });
    const waitParsed = parseResult(waitResult);
    assert("wait_for finds selector", waitParsed.found === true);

  } finally {
    await client.close();
  }

  console.log("");
  console.log("============================================");
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("============================================");
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main();
