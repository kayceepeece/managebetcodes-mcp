#!/usr/bin/env node
/** stdio entry point for @managebetcodes/mcp */

import { McpServer } from "./server.js";

function main(): void {
  const server = new McpServer();
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
      if (!line) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }) + "\n",
        );
        continue;
      }

      server
        .handleMessage(parsed)
        .then((response) => {
          if (response !== null) {
            process.stdout.write(JSON.stringify(response) + "\n");
          }
        })
        .catch((err) => {
          process.stderr.write(
            `[managebetcodes-mcp] unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        });
    }
  });
}

main();
