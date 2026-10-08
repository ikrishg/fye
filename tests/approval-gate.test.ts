import { describe, expect, it, beforeEach } from "vitest";
import { ApprovalGateError, executeApprovedPurchase } from "@/agent/purchase";
import type { PurchaseProposal } from "@/domain/types";
import { MockPayPalAdapter, resetMockPayPalOrders } from "@/paypal/mock-adapter";
import { resetStoreForTests } from "@/store/memory-store";

const baseProposal: PurchaseProposal = {
  id: "p1",
  request: {
    description: "Test item",
    amountCents: 50_00,
    currency: "USD",
  },
  research: {
    summary: "ok",
    balanceBeforeCents: 100_00,
    netWorthBeforeCents: 100_00,
    projectedNetWorthCents: 50_00,
    canAfford: true,
    warnings: [],
  },
  status: "pending_approval",
  approvalToken: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date().toISOString(),
};

describe("approval gate", () => {
  beforeEach(() => {
    resetMockPayPalOrders();
    const store = resetStoreForTests();
    store.saveProposal(baseProposal);
  });

  it("blocks when not approved", async () => {
    const store = resetStoreForTests();
    store.saveProposal(baseProposal);
    await expect(
      executeApprovedPurchase(store, new MockPayPalAdapter(), baseProposal.id, {
        approved: false,
        approvalToken: baseProposal.approvalToken,
      }),
    ).rejects.toThrow(ApprovalGateError);
  });

  it("blocks wrong token", async () => {
    const store = resetStoreForTests();
    store.saveProposal(baseProposal);
    await expect(
      executeApprovedPurchase(store, new MockPayPalAdapter(), baseProposal.id, {
        approved: true,
        approvalToken: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow(/token/i);
  });

  it("creates sandbox order only after approval", async () => {
    const store = resetStoreForTests();
    store.saveProposal(baseProposal);
    const adapter = new MockPayPalAdapter();
    const result = await executeApprovedPurchase(
      store,
      adapter,
      baseProposal.id,
      {
        approved: true,
        approvalToken: baseProposal.approvalToken,
      },
    );
    expect(result.status).toBe("order_created");
    expect(result.paypalOrderId).toMatch(/^MOCK-ORDER-/);
  });
});
