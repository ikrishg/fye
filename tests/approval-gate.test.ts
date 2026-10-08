import { describe, expect, it } from "vitest";
import { ApprovalGateError, assertHumanApproval, executeApprovedPurchase } from "@/agent/purchase";
import type { PurchaseProposal } from "@/domain/types";
import { MockPayPalAdapter } from "@/paypal/mock-adapter";

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
  it("blocks when not approved", () => {
    expect(() =>
      assertHumanApproval(baseProposal, {
        approved: false,
        approvalToken: baseProposal.approvalToken,
      }),
    ).toThrow(ApprovalGateError);
  });

  it("blocks wrong token", () => {
    expect(() =>
      assertHumanApproval(baseProposal, {
        approved: true,
        approvalToken: "00000000-0000-4000-8000-000000000099",
      }),
    ).toThrow(/token/i);
  });

  it("blocks already processed proposals", () => {
    expect(() =>
      assertHumanApproval(
        { ...baseProposal, status: "order_created" },
        { approved: true, approvalToken: baseProposal.approvalToken },
      ),
    ).toThrow(/pending/);
  });

  it("creates sandbox order only after approval", async () => {
    const adapter = new MockPayPalAdapter();
    const result = await executeApprovedPurchase(adapter, baseProposal, {
      approved: true,
      approvalToken: baseProposal.approvalToken,
    });
    expect(result.status).toBe("order_created");
    expect(result.paypalOrderId).toMatch(/^MOCK-ORDER-/);
  });
});
