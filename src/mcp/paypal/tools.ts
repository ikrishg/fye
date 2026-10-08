import { z } from "zod";
import { ApprovalGateError } from "@/agent/purchase";
import type { PayPalTransaction } from "@/domain/types";
import type { PayPalAdapter } from "@/paypal/types";
import type { FyeStore } from "@/store/memory-store";

/**
 * Tool names and input shapes mirror @paypal/agent-toolkit@1.11.0
 * (`list_transactions`, `create_order`) so this server can be swapped for
 * PayPal's own MCP server later. `fye_approval` is fye-specific: PayPal's
 * create_order has no human gate, ours refuses without an approved proposal.
 */
export const PAYPAL_MCP_TOOLS = {
  listTransactions: "list_transactions",
  createOrder: "create_order",
} as const;

export const listTransactionsShape = {
  transaction_id: z.string().nullable().optional().default(null),
  transaction_status: z.enum(["D", "P", "S", "V"]).optional().default("S"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page_size: z.number().int().min(1).max(500).optional().default(100),
  page: z.number().int().min(1).max(10_000).optional().default(1),
};
export const listTransactionsSchema = z.object(listTransactionsShape);
export type ListTransactionsArgs = z.input<typeof listTransactionsSchema>;

export interface ListTransactionsResult {
  mode: PayPalAdapter["mode"];
  transaction_details: PayPalTransaction[];
  total_items: number;
  total_pages: number;
}

const lineItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  description: z.string().optional(),
  itemCost: z.number().nonnegative(),
  taxPercent: z.number().nonnegative().default(0),
  itemTotal: z.number().nonnegative(),
});

export const createOrderShape = {
  currencyCode: z.enum(["USD"]),
  items: z.array(lineItemSchema).min(1).max(50),
  discount: z.number().nonnegative().optional().default(0),
  shippingCost: z.number().nonnegative().optional().default(0),
  notes: z.string().nullable().optional().default(null),
  returnUrl: z.string().optional().default("https://example.com/returnUrl"),
  cancelUrl: z.string().optional().default("https://example.com/cancelUrl"),
  fye_approval: z.object({
    proposal_id: z.string().min(1),
    approval_token: z.string().min(1),
  }),
};
export const createOrderSchema = z.object(createOrderShape);
export type CreateOrderArgs = z.input<typeof createOrderSchema>;

export interface CreateOrderResult {
  mode: PayPalAdapter["mode"];
  id: string;
  status: "CREATED";
  intent: "CAPTURE";
  purchase_units: Array<{
    amount: { currency_code: string; value: string };
    description: string;
  }>;
  links: Array<{ rel: "approve"; href: string; method: "GET" }>;
}

export interface PayPalMcpDeps {
  adapter: PayPalAdapter;
  store: FyeStore;
}

const toCents = (value: number) => Math.round(value * 100);

export function orderTotalCents(args: z.output<typeof createOrderSchema>): number {
  const itemsCents = args.items.reduce((sum, item) => {
    const unit = toCents(item.itemCost);
    const tax = Math.round((unit * item.taxPercent) / 100);
    return sum + (unit + tax) * item.quantity;
  }, 0);
  return itemsCents + toCents(args.shippingCost) - toCents(args.discount);
}

export async function listTransactions(
  deps: PayPalMcpDeps,
  rawArgs: ListTransactionsArgs,
): Promise<ListTransactionsResult> {
  const args = listTransactionsSchema.parse(rawArgs);
  const end = args.end_date ?? new Date().toISOString();
  const start =
    args.start_date ??
    new Date(new Date(end).getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();

  const result = await deps.adapter.listTransactions({
    startDate: start,
    endDate: end,
    page: args.page,
    pageSize: args.page_size,
  });

  const transactions = result.transactions.filter(
    (txn) =>
      txn.transaction_status === args.transaction_status &&
      (!args.transaction_id || txn.transaction_id === args.transaction_id),
  );

  return {
    mode: deps.adapter.mode,
    transaction_details: transactions,
    total_items: args.transaction_id ? transactions.length : result.totalItems,
    total_pages: args.transaction_id ? 1 : result.totalPages,
  };
}

export function createOrderTool(deps: PayPalMcpDeps) {
  const inFlight = new Set<string>();

  return async function createOrder(rawArgs: CreateOrderArgs): Promise<CreateOrderResult> {
    const args = createOrderSchema.parse(rawArgs);
    const { proposal_id, approval_token } = args.fye_approval;
    const proposal = deps.store.getProposal(proposal_id);

    if (!proposal) {
      throw new ApprovalGateError(`Unknown purchase proposal ${proposal_id}.`);
    }
    if (proposal.approvalToken !== approval_token) {
      throw new ApprovalGateError("Invalid approval token.");
    }
    if (proposal.status !== "creating_order" || inFlight.has(proposal_id)) {
      throw new ApprovalGateError(
        `create_order requires a human-approved proposal (status=${proposal.status}).`,
      );
    }

    const totalCents = orderTotalCents(args);
    if (
      args.currencyCode !== proposal.request.currency ||
      totalCents !== proposal.request.amountCents
    ) {
      throw new ApprovalGateError("Order total does not match the approved proposal.");
    }

    inFlight.add(proposal_id);
    try {
      const description = args.notes ?? args.items.map((i) => i.name).join(", ");
      const order = await deps.adapter.createSandboxOrder({
        amountCents: totalCents,
        currency: args.currencyCode,
        description,
        idempotencyKey: proposal.id,
      });

      deps.store.saveProposal({
        ...proposal,
        status: "order_created",
        paypalOrderId: order.orderId,
      });

      return {
        mode: deps.adapter.mode,
        id: order.orderId,
        status: "CREATED",
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: args.currencyCode,
              value: (totalCents / 100).toFixed(2),
            },
            description,
          },
        ],
        links: [{ rel: "approve", href: order.approvalUrl, method: "GET" }],
      };
    } finally {
      inFlight.delete(proposal_id);
    }
  };
}
