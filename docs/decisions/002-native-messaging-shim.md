# ADR 002: Native Messaging Shim Architecture

## Status
Accepted

## Context
The foundation doc implies the Phantom MCP Server is also the Native Messaging host (the process Chrome launches). Both MCP (Claude Code) and Native Messaging (Chrome) communicate via stdin/stdout. A single process cannot serve both because it only has one stdin and one stdout, and the parent process that launched it owns those pipes.

## Decision
Use a separate thin shim process for Native Messaging. The MCP server listens on a unix domain socket. Chrome launches the shim, which connects to the MCP server over that socket and relays length-prefixed JSON bidirectionally.

```
Claude Code --stdio--> MCP Server --unix socket (/tmp/phantom.sock)--> NM Shim --stdio--> Chrome Extension
```

The shim is ~50 lines of Node.js. It handles only protocol translation (Native Messaging's 4-byte length-prefixed JSON <-> newline-delimited JSON on the socket). No business logic.

## Consequences
- Adds one additional process during operation (minimal resource cost)
- Clean separation of concerns: MCP server owns Claude Code communication, shim owns Chrome communication
- MCP server can start independently of Chrome (useful for testing)
- If the shim crashes, the extension detects via `port.onDisconnect` and can reconnect (which relaunches the shim)
- The shim's path goes in the Native Messaging host manifest; the MCP server's path does not
