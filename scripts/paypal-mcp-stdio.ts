#!/usr/bin/env npx tsx
/**
 * fye PayPal MCP server over stdio (list_transactions, create_order).
 * Fixture-backed unless PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET + PAYPAL_ENV=sandbox are set.
 * This process has its own empty proposal store, so create_order always refuses here:
 * orders are only created through the app's approve endpoint.
 *
 * Usage:
 *   npm run mcp:paypal
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPayPalMcpServer } from "../src/mcp/paypal/server";
import { createPayPalAdapter } from "../src/paypal/factory";
import { createMemoryStore } from "../src/store/memory-store";

const server = createPayPalMcpServer({
  adapter: createPayPalAdapter(),
  store: createMemoryStore(),
});

server.connect(new StdioServerTransport()).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
