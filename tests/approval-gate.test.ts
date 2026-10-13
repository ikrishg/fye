import { describe, expect, it, beforeEach, vi } from "vitest";
import { ApprovalGateError, executeApprovedPurchase } from "@/agent/purchase";
import type { PurchaseProposal } from "@/domain/types";
import { connectPayPalMcp } from "@/mcp/paypal/client";
import { MockPayPalAdapter, resetMockPayPalOrders } from "@/paypal/mock-adapter";
import { resetStoreForTests, type FyeStore } from "@/store/memory-store";

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

async function approveViaMcp(
  store: FyeStore,
  adapter: MockPayPalAdapter,
  approval: { approved: boolean; approvalToken: string },
) {
  const paypal = await connectPayPalMcp({ adapter, store });
  try {
    return await executeApprovedPurchase(paypal, store, baseProposal.id, approval);
  } finally {
    await paypal.close();
  }
}

describe("approval gate", () => {
  let store: FyeStore;

  beforeEach(() => {
    resetMockPayPalOrders();
    store = resetStoreForTests();
    store.saveProposal(baseProposal);
  });

  it("blocks when not approved, creating no order", async () => {
    const adapter = new MockPayPalAdapter();
    const spy = vi.spyOn(adapter, "createSandboxOrder");
    await expect(
      approveViaMcp(store, adapter, {
        approved: false,
        approvalToken: baseProposal.approvalToken,
      }),
    ).rejects.toThrow(ApprovalGateError);
    expect(spy).not.toHaveBeenCalled();
    expect(store.getProposal(baseProposal.id)?.status).toBe("pending_approval");
    expect(store.getProposal(baseProposal.id)?.paypalOrderId).toBeUndefined();
  });

  it("blocks wrong token", async () => {
    await expect(
      approveViaMcp(store, new MockPayPalAdapter(), {
        approved: true,
        approvalToken: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow(/token/i);
  });

  it("creates sandbox order via MCP create_order only after approval", async () => {
    const result = await approveViaMcp(store, new MockPayPalAdapter(), {
      approved: true,
      approvalToken: baseProposal.approvalToken,
    });
    expect(result.status).toBe("order_created");
    expect(result.paypalOrderId).toMatch(/^MOCK-ORDER-/);
    expect(store.getProposal(baseProposal.id)?.paypalOrderId).toBe(result.paypalOrderId);
  });
});
