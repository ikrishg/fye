import { describe, expect, it, beforeEach, vi } from "vitest";
import { executeApprovedPurchase } from "@/agent/purchase";
import type { PurchaseProposal } from "@/domain/types";
import { connectPayPalMcp, type PayPalMcpClient } from "@/mcp/paypal/client";
import { MockPayPalAdapter, resetMockPayPalOrders } from "@/paypal/mock-adapter";
import { resetStoreForTests, type FyeStore } from "@/store/memory-store";

const proposal: PurchaseProposal = {
  id: "prop-idempotent-1",
  request: {
    description: "Headphones",
    amountCents: 100_00,
    currency: "USD",
  },
  research: {
    summary: "ok",
    balanceBeforeCents: 500_00,
    netWorthBeforeCents: 500_00,
    projectedNetWorthCents: 400_00,
    canAfford: true,
    warnings: [],
  },
  status: "pending_approval",
  approvalToken: "00000000-0000-4000-8000-0000000000aa",
  createdAt: new Date().toISOString(),
};

const approval = { approved: true, approvalToken: proposal.approvalToken };

describe("approve idempotency", () => {
  let store: FyeStore;
  let adapter: MockPayPalAdapter;
  let paypal: PayPalMcpClient;

  beforeEach(async () => {
    resetMockPayPalOrders();
    store = resetStoreForTests();
    store.saveProposal(proposal);
    adapter = new MockPayPalAdapter();
    paypal = await connectPayPalMcp({ adapter, store });
    return () => paypal.close();
  });

  it("two approves with the same key make exactly one order", async () => {
    const spy = vi.spyOn(adapter, "createSandboxOrder");

    const first = await executeApprovedPurchase(paypal, store, proposal.id, approval);
    const second = await executeApprovedPurchase(paypal, store, proposal.id, approval);

    expect(first.status).toBe("order_created");
    expect(second.status).toBe("order_created");
    expect(second.paypalOrderId).toBe(first.paypalOrderId);

    const keys = spy.mock.calls.map(([input]) => input.idempotencyKey);
    expect(keys).toEqual([proposal.id, proposal.id]);
    const orderIds = await Promise.all(spy.mock.results.map((r) => r.value));
    expect(new Set(orderIds.map((o: { orderId: string }) => o.orderId)).size).toBe(1);
  });

  it("concurrent approves still produce exactly one order", async () => {
    const results = await Promise.allSettled([
      executeApprovedPurchase(paypal, store, proposal.id, approval),
      executeApprovedPurchase(paypal, store, proposal.id, approval),
    ]);

    const orderIds = new Set(
      results.flatMap((r) => (r.status === "fulfilled" ? [r.value.paypalOrderId] : [])),
    );
    expect(orderIds.size).toBe(1);
    expect(store.getProposal(proposal.id)?.paypalOrderId).toBe([...orderIds][0]);
  });
});
