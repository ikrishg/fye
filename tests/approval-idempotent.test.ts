import { describe, expect, it, beforeEach } from "vitest";
import { executeApprovedPurchase } from "@/agent/purchase";
import type { PurchaseProposal } from "@/domain/types";
import { connectPayPalMcp } from "@/mcp/paypal/client";
import { MockPayPalAdapter, resetMockPayPalOrders } from "@/paypal/mock-adapter";
import { resetStoreForTests } from "@/store/memory-store";

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

describe("approve idempotency", () => {
  beforeEach(() => {
    resetMockPayPalOrders();
    const store = resetStoreForTests();
    store.saveProposal(proposal);
  });

  it("returns the same order when approve is called twice", async () => {
    const store = resetStoreForTests();
    store.saveProposal(proposal);
    const paypal = await connectPayPalMcp({ adapter: new MockPayPalAdapter(), store });
    const approval = {
      approved: true,
      approvalToken: proposal.approvalToken,
    };

    const first = await executeApprovedPurchase(paypal, store, proposal.id, approval);
    const second = await executeApprovedPurchase(paypal, store, proposal.id, approval);
    await paypal.close();

    expect(first.paypalOrderId).toBeDefined();
    expect(second.paypalOrderId).toBe(first.paypalOrderId);
    expect(second.status).toBe("order_created");
  });
});
