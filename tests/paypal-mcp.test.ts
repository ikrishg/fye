import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalGateError, orderArgsForProposal } from "@/agent/purchase";
import { createPurchaseProposal } from "@/agent/research";
import type { PurchaseProposal } from "@/domain/types";
import { connectPayPalMcp, PayPalMcpToolError, type PayPalMcpClient } from "@/mcp/paypal/client";
import { orderTotalCents, createOrderSchema } from "@/mcp/paypal/tools";
import { MockPayPalAdapter, resetMockPayPalOrders } from "@/paypal/mock-adapter";
import { syncPayPalTransactions } from "@/paypal/sync";
import { createMemoryStore, type FyeStore } from "@/store/memory-store";

let store: FyeStore;
let adapter: MockPayPalAdapter;
let paypal: PayPalMcpClient;

function newProposal(amountCents = 299_00): PurchaseProposal {
  const proposal = createPurchaseProposal(store.getBalanceSheet(), store.listCommitments(), {
    description: "New headphones",
    amountCents,
    currency: "USD",
  });
  store.saveProposal(proposal);
  return proposal;
}

beforeEach(async () => {
  resetMockPayPalOrders();
  store = createMemoryStore();
  adapter = new MockPayPalAdapter();
  paypal = await connectPayPalMcp({ adapter, store });
});

afterEach(async () => {
  await paypal.close();
});

describe("fye PayPal MCP server", () => {
  it("exposes the PayPal agent-toolkit tool names", async () => {
    expect((await paypal.listToolNames()).sort()).toEqual(["create_order", "list_transactions"]);
  });

  it("list_transactions returns fixture rows in fixture mode", async () => {
    const result = await paypal.listTransactions();
    expect(result.mode).toBe("mock");
    expect(result.transaction_details.map((t) => t.transaction_id)).toEqual([
      "MOCK-TXN-001",
      "MOCK-TXN-002",
      "MOCK-TXN-003",
    ]);
    expect(result.total_items).toBe(3);
  });

  it("list_transactions filters by transaction_id and status", async () => {
    const byId = await paypal.listTransactions({ transaction_id: "MOCK-TXN-002" });
    expect(byId.transaction_details).toHaveLength(1);
    expect(byId.transaction_details[0]?.transaction_amount.value).toBe("450.00");
    expect(byId.total_items).toBe(1);

    const pending = await paypal.listTransactions({ transaction_status: "P" });
    expect(pending.transaction_details).toHaveLength(0);
  });

  it("list_transactions rejects invalid input via the MCP schema", async () => {
    await expect(
      paypal.listTransactions({ transaction_status: "X" as "S" }),
    ).rejects.toThrow(PayPalMcpToolError);
  });

  it("sync maps list_transactions rows into balance-sheet lines", async () => {
    const lines = await syncPayPalTransactions(paypal, {
      startDate: "2026-09-01T00:00:00Z",
      endDate: "2026-10-01T00:00:00Z",
    });
    expect(lines.map((l) => l.externalId)).toEqual([
      "MOCK-TXN-001",
      "MOCK-TXN-002",
      "MOCK-TXN-003",
    ]);
    expect(lines.find((l) => l.externalId === "MOCK-TXN-002")?.category).toBe("cash");
  });

  describe("create_order approval gate", () => {
    it("refuses a proposal that is still pending human approval", async () => {
      const spy = vi.spyOn(adapter, "createSandboxOrder");
      const proposal = newProposal();
      await expect(paypal.createOrder(orderArgsForProposal(proposal))).rejects.toThrow(
        ApprovalGateError,
      );
      expect(spy).not.toHaveBeenCalled();
      expect(store.getProposal(proposal.id)?.paypalOrderId).toBeUndefined();
    });

    it("refuses unknown proposals and wrong tokens", async () => {
      const spy = vi.spyOn(adapter, "createSandboxOrder");
      const proposal = newProposal();
      store.saveProposal({ ...proposal, status: "creating_order" });

      const args = orderArgsForProposal(proposal);
      await expect(
        paypal.createOrder({ ...args, fye_approval: { ...args.fye_approval, proposal_id: "nope" } }),
      ).rejects.toThrow(/Unknown purchase proposal/);
      await expect(
        paypal.createOrder({
          ...args,
          fye_approval: { ...args.fye_approval, approval_token: "wrong" },
        }),
      ).rejects.toThrow(/Invalid approval token/);
      expect(spy).not.toHaveBeenCalled();
    });

    it("refuses an order whose total differs from the approved amount", async () => {
      const spy = vi.spyOn(adapter, "createSandboxOrder");
      const proposal = newProposal(100_00);
      store.saveProposal({ ...proposal, status: "creating_order" });
      const args = orderArgsForProposal(proposal);
      await expect(
        paypal.createOrder({ ...args, shippingCost: 5 }),
      ).rejects.toThrow(/does not match/);
      expect(spy).not.toHaveBeenCalled();
    });

    it("refuses calls without fye_approval (schema-level)", async () => {
      const proposal = newProposal();
      const { fye_approval: _omit, ...args } = orderArgsForProposal(proposal);
      await expect(
        paypal.createOrder(args as Parameters<PayPalMcpClient["createOrder"]>[0]),
      ).rejects.toThrow(PayPalMcpToolError);
    });

    it("refuses calls without idempotencyKey (schema-level)", async () => {
      const proposal = newProposal();
      store.saveProposal({ ...proposal, status: "creating_order" });
      const { idempotencyKey: _omit, ...args } = orderArgsForProposal(proposal);
      await expect(
        paypal.createOrder(args as Parameters<PayPalMcpClient["createOrder"]>[0]),
      ).rejects.toThrow(PayPalMcpToolError);
    });

    it("refuses an idempotencyKey not derived from the proposal id", async () => {
      const spy = vi.spyOn(adapter, "createSandboxOrder");
      const proposal = newProposal();
      store.saveProposal({ ...proposal, status: "creating_order" });
      await expect(
        paypal.createOrder({ ...orderArgsForProposal(proposal), idempotencyKey: "fresh-key" }),
      ).rejects.toThrow(/idempotencyKey/);
      expect(spy).not.toHaveBeenCalled();
    });

    it("creates a fixture order once approved, and replays it for the same key", async () => {
      const spy = vi.spyOn(adapter, "createSandboxOrder");
      const proposal = newProposal(299_00);
      store.saveProposal({ ...proposal, status: "creating_order" });

      const order = await paypal.createOrder(orderArgsForProposal(proposal));
      expect(order.mode).toBe("mock");
      expect(order.id).toBe(`MOCK-ORDER-${proposal.id.slice(0, 8)}`);
      expect(order.status).toBe("CREATED");
      expect(order.purchase_units[0]?.amount).toEqual({ currency_code: "USD", value: "299.00" });
      expect(order.links[0]?.rel).toBe("approve");

      const saved = store.getProposal(proposal.id);
      expect(saved?.status).toBe("order_created");
      expect(saved?.paypalOrderId).toBe(order.id);

      const retry = await paypal.createOrder(orderArgsForProposal(proposal));
      expect(retry.id).toBe(order.id);
      expect(store.getProposal(proposal.id)?.paypalOrderId).toBe(order.id);
      expect(spy.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
        proposal.id,
        proposal.id,
      ]);
    });
  });

  it("computes order totals in cents like the toolkit breakdown", () => {
    const args = createOrderSchema.parse({
      currencyCode: "USD",
      items: [
        { name: "a", quantity: 2, itemCost: 10.1, taxPercent: 10, itemTotal: 22.22 },
      ],
      shippingCost: 3,
      discount: 1,
      idempotencyKey: "p",
      fye_approval: { proposal_id: "p", approval_token: "t" },
    });
    expect(orderTotalCents(args)).toBe(2 * (1010 + 101) + 300 - 100);
  });
});
