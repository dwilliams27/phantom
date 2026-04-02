import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ExtensionClient } from "./extension-client.js";

const extensionClient = new ExtensionClient();

const server = new McpServer({
  name: "phantom-mcp",
  version: "1.0.0",
});

server.registerTool("ping", {
  description: "Ping the Phantom extension to verify connectivity",
  inputSchema: {},
}, async () => {
  const result = await extensionClient.sendCommand("ping");
  if (result.error) {
    return { content: [{ type: "text" as const, text: result.error }], isError: true };
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(result.result) }] };
});

async function main() {
  await extensionClient.listen();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[phantom-mcp] Server running on stdio");
}

main();
