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
    // 1. List tools
    const { tools } = await client.listTools();
    assert("tools registered", tools.length > 0, `got ${tools.length} tools`);
    assert("ping tool exists", tools.some(t => t.name === "ping"));

    // 2. Call ping
    const ping = await client.callTool({ name: "ping", arguments: {} });
    const content = ping.content as Array<{ type: string; text?: string }>;
    const pingText = content[0]?.text ?? "";
    assert("ping returns pong", pingText.includes("pong"), pingText);
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
