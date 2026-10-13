import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApprovalGateError } from "@/agent/purchase";
import {
  createOrderShape,
  createOrderTool,
  listTransactions,
  listTransactionsShape,
  PAYPAL_MCP_TOOLS,
  type PayPalMcpDeps,
} from "./tools";

export const PAYPAL_MCP_SERVER_NAME = "fye-paypal";

export type PayPalMcpErrorCode = "approval_required" | "tool_failed";

function ok(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function fail(err: unknown): CallToolResult {
  const code: PayPalMcpErrorCode =
    err instanceof ApprovalGateError ? "approval_required" : "tool_failed";
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
  };
}

export function createPayPalMcpServer(deps: PayPalMcpDeps): McpServer {
  const server = new McpServer({ name: PAYPAL_MCP_SERVER_NAME, version: "0.1.0" });
  const createOrder = createOrderTool(deps);

  server.registerTool(
    PAYPAL_MCP_TOOLS.listTransactions,
    {
      title: "List Transactions",
      description:
        "List PayPal transactions (fixtures unless PayPal sandbox credentials are set).",
      inputSchema: listTransactionsShape,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        return ok(await listTransactions(deps, args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    PAYPAL_MCP_TOOLS.createOrder,
    {
      title: "Create Order",
      description:
        "Create a PayPal order and payment (approve) link for a purchase proposal. " +
        "Refused unless a human has approved the proposal; the total must match it.",
      inputSchema: createOrderShape,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return ok(await createOrder(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
