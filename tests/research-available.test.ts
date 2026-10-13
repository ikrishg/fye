import { beforeEach, describe, expect, it } from "vitest";
import { executeApprovedPurchase } from "@/agent/purchase";
import { createPurchaseProposal, researchPurchase } from "@/agent/research";
import { connectPayPalMcp, type PayPalMcpClient } from "@/mcp/paypal/client";
import { MockPayPalAdapter, resetMockPayPalOrders } from "@/paypal/mock-adapter";
import { resetStoreForTests, type FyeStore } from "@/store/memory-store";

describe("research checks against Available", () => {
  let store: FyeStore;
  let paypal: PayPalMcpClient;

  beforeEach(async () => {
    resetMockPayPalOrders();
    store = resetStoreForTests();
    // Non-cash, so it lifts net worth to $3050.00 without changing cash or Available.
    store.addManualAsset({
      id: "brokerage",
      name: "Brokerage",
      amountCents: 1000_00,
      category: "investment",
      source: "manual",
      updatedAt: "",
    });
    paypal = await connectPayPalMcp({ adapter: new MockPayPalAdapter(), store });
    return () => paypal.close();
  });

  async function approveFirstPurchase() {
    // Checking $2500.00 cash + Brokerage $1000.00, Credit card $450.00 debt: net worth $3050.00.
    const first = createPurchaseProposal(store.getBalanceSheet(), store.listCommitments(), {
      description: "New headphones",
      amountCents: 299_00,
      currency: "USD",
    });
    store.saveProposal(first);
    await executeApprovedPurchase(paypal, store, first.id, {
      approved: true,
      approvalToken: first.approvalToken,
    });
  }

  it("a second proposal after an open commitment uses Available, not cash", async () => {
    await approveFirstPurchase();
    expect(store.listCommitments()).toEqual([
      expect.objectContaining({ amountCents: 299_00, status: "pending" }),
    ]);

    const second = createPurchaseProposal(store.getBalanceSheet(), store.listCommitments(), {
      description: "Desk",
      amountCents: 2300_00,
      currency: "USD",
    });

    // Cash ($2500.00) would cover it; Available ($2500.00 - $299.00 = $2201.00) does not.
    expect(second.research.balanceBeforeCents).toBe(2201_00);
    expect(second.research.canAfford).toBe(false);
    expect(second.research.projectedNetWorthCents).toBe(3050_00 - 299_00 - 2300_00);
    expect(second.research.warnings).toContain(
      "Purchase ($2300.00) exceeds available balance ($2201.00).",
    );
    expect(second.research.summary).toContain("Pending commitments: $299.00 | Available: $2201.00.");
  });

  it("projects net worth after open commitments and the new purchase settle", async () => {
    await approveFirstPurchase();

    const research = researchPurchase(store.getBalanceSheet(), store.listCommitments(), {
      description: "Lamp",
      amountCents: 200_00,
      currency: "USD",
    });

    expect(research.canAfford).toBe(true);
    expect(research.netWorthBeforeCents).toBe(3050_00);
    expect(research.projectedNetWorthCents).toBe(3050_00 - 299_00 - 200_00);
  });

  it("with no commitments, Available equals liquid cash", () => {
    const research = researchPurchase(store.getBalanceSheet(), [], {
      description: "Desk",
      amountCents: 2300_00,
      currency: "USD",
    });
    expect(research.balanceBeforeCents).toBe(2500_00);
    expect(research.canAfford).toBe(true);
  });
});
