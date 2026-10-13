import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApprovalGateError } from "@/agent/purchase";
import { createPayPalAdapter } from "@/paypal/factory";
import { getStore } from "@/store/memory-store";
import { createPayPalMcpServer, type PayPalMcpErrorCode } from "./server";
import {
  PAYPAL_MCP_TOOLS,
  type CreateOrderArgs,
  type CreateOrderResult,
  type ListTransactionsArgs,
  type ListTransactionsResult,
  type PayPalMcpDeps,
} from "./tools";

export interface PayPalMcpClient {
  listToolNames(): Promise<string[]>;
  listTransactions(args?: ListTransactionsArgs): Promise<ListTransactionsResult>;
  createOrder(args: CreateOrderArgs): Promise<CreateOrderResult>;
  close(): Promise<void>;
}

export class PayPalMcpToolError extends Error {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super(message);
    this.name = "PayPalMcpToolError";
  }
}

function readText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const first = content.find((c) => c.type === "text");
  return first?.text ?? "";
}

/** Connects an MCP client to an in-process fye PayPal MCP server. */
export async function connectPayPalMcp(deps: PayPalMcpDeps): Promise<PayPalMcpClient> {
  const server = createPayPalMcpServer(deps);
  const client = new Client({ name: "fye-app", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  async function call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const result = await client.callTool({ name: tool, arguments: args });
    const text = readText(result);
    if (result.isError) {
      let code: PayPalMcpErrorCode = "tool_failed";
      let message = text;
      try {
        const parsed = JSON.parse(text) as { error: { code: PayPalMcpErrorCode; message: string } };
        code = parsed.error.code;
        message = parsed.error.message;
      } catch {
        // input validation errors from the SDK are plain text
      }
      if (code === "approval_required") {
        throw new ApprovalGateError(message);
      }
      throw new PayPalMcpToolError(tool, message);
    }
    return JSON.parse(text) as T;
  }

  return {
    async listToolNames() {
      const { tools } = await client.listTools();
      return tools.map((t) => t.name);
    },
    listTransactions: (args = {}) =>
      call<ListTransactionsResult>(PAYPAL_MCP_TOOLS.listTransactions, args),
    createOrder: (args) =>
      call<CreateOrderResult>(PAYPAL_MCP_TOOLS.createOrder, args as Record<string, unknown>),
    async close() {
      await client.close();
      await server.close();
    },
  };
}

/** Runs `fn` against the app's PayPal MCP server (env-gated adapter + shared store). */
export async function withPayPalMcp<T>(
  fn: (paypal: PayPalMcpClient, deps: PayPalMcpDeps) => Promise<T>,
): Promise<T> {
  const deps: PayPalMcpDeps = { adapter: createPayPalAdapter(), store: getStore() };
  const paypal = await connectPayPalMcp(deps);
  try {
    return await fn(paypal, deps);
  } finally {
    await paypal.close();
  }
}
