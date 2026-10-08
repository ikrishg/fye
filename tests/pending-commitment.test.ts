import { beforeEach, describe, expect, it } from "vitest";
import { executeApprovedPurchase } from "@/agent/purchase";
import { balanceTotals, findSettlingLine } from "@/domain/commitments";
import type { BalanceSheet, PendingCommitment, PurchaseProposal } from "@/domain/types";
import { connectPayPalMcp, type PayPalMcpClient } from "@/mcp/paypal/client";
import {
  MOCK_APPROVAL_HOST,
  MockPayPalAdapter,
  resetMockPayPalOrders,
} from "@/paypal/mock-adapter";
import { applyPayPalSync } from "@/paypal/sync";
import { resetStoreForTests, type FyeStore } from "@/store/memory-store";

const range = { startDate: "2026-09-08T00:00:00Z", endDate: "2026-10-08T00:00:00Z" };

const proposal: PurchaseProposal = {
  id: "c0ffee00-0000-4000-8000-000000000001",
  request: { description: "New headphones", amountCents: 299_00, currency: "USD" },
  research: {
    summary: "ok",
    balanceBeforeCents: 2500_00,
    netWorthBeforeCents: 2050_00,
    projectedNetWorthCents: 1751_00,
    canAfford: true,
    warnings: [],
  },
  status: "pending_approval",
  approvalToken: "00000000-0000-4000-8000-0000000000bb",
  createdAt: new Date().toISOString(),
};
const approval = { approved: true, approvalToken: proposal.approvalToken };
const orderId = "MOCK-ORDER-c0ffee00";
const captureId = "MOCK-CAP-c0ffee00";

function totals(store: FyeStore) {
  return balanceTotals(store.getBalanceSheet(), store.listCommitments());
}

describe("pending commitment on approve", () => {
  let store: FyeStore;
  let paypal: PayPalMcpClient;

  beforeEach(async () => {
    resetMockPayPalOrders();
    store = resetStoreForTests();
    store.saveProposal(proposal);
    paypal = await connectPayPalMcp({ adapter: new MockPayPalAdapter(), store });
    return () => paypal.close();
  });

  it("records a pending commitment that lowers available but not cash or net worth", async () => {
    const before = totals(store);
    const approved = await executeApprovedPurchase(paypal, store, proposal.id, approval);

    expect(approved.paypalOrderId).toBe(orderId);
    expect(store.listCommitments()).toEqual([
      expect.objectContaining({
        proposalId: proposal.id,
        orderId,
        amountCents: 299_00,
        status: "pending",
      }),
    ]);

    const after = totals(store);
    expect(after.liquidCashCents).toBe(before.liquidCashCents);
    expect(after.netWorthCents).toBe(before.netWorthCents);
    expect(after.pendingCommitmentsCents).toBe(299_00);
    expect(after.availableCents).toBe(before.availableCents - 299_00);
  });

  it("stores create_order's approve link on the proposal (mock host in fixture mode)", async () => {
    const approved = await executeApprovedPurchase(paypal, store, proposal.id, approval);
    const url = new URL(approved.paypalApprovalUrl ?? "");
    expect(url.hostname).toBe(MOCK_APPROVAL_HOST);
    expect(url.searchParams.get("token")).toBe(orderId);
  });

  it("does not add a second commitment when approve is retried", async () => {
    await executeApprovedPurchase(paypal, store, proposal.id, approval);
    await executeApprovedPurchase(paypal, store, proposal.id, approval);

    expect(store.listCommitments()).toHaveLength(1);
    expect(totals(store).pendingCommitmentsCents).toBe(299_00);
  });

  it("settles on the matching capture: cash drops by the order and Available stays put", async () => {
    // Seed: Checking $2500.00 cash, Credit card $450.00 debt.
    await applyPayPalSync(paypal, store, range);
    // Fixtures: +450.00 in, -12.50 and -9.99 out, all on cash.
    expect(totals(store)).toEqual({
      assetsCents: 2927_51,
      liabilitiesCents: 450_00,
      netWorthCents: 2477_51,
      liquidCashCents: 2927_51,
      pendingCommitmentsCents: 0,
      availableCents: 2927_51,
    });

    await executeApprovedPurchase(paypal, store, proposal.id, approval);
    const afterApprove = totals(store);
    expect(afterApprove).toEqual({
      assetsCents: 2927_51,
      liabilitiesCents: 450_00,
      netWorthCents: 2477_51,
      liquidCashCents: 2927_51,
      pendingCommitmentsCents: 299_00,
      availableCents: 2628_51,
    });

    const { settledCommitments } = await applyPayPalSync(paypal, store, range);

    expect(settledCommitments).toEqual([
      expect.objectContaining({ orderId, status: "settled", settledByTransactionId: captureId }),
    ]);
    const sheet = store.getBalanceSheet();
    expect(sheet.assets.filter((l) => l.externalId === captureId)).toEqual([
      expect.objectContaining({
        source: "paypal_sync",
        category: "cash",
        orderReference: orderId,
        amountCents: -299_00,
      }),
    ]);
    expect(sheet.liabilities.map((l) => l.name)).toEqual(["Credit card balance"]);

    const afterSettle = totals(store);
    expect(afterSettle).toEqual({
      assetsCents: 2628_51,
      liabilitiesCents: 450_00,
      netWorthCents: 2178_51,
      liquidCashCents: 2628_51,
      pendingCommitmentsCents: 0,
      availableCents: 2628_51,
    });
    expect(afterSettle.availableCents).toBe(afterApprove.availableCents);
  });

  it("does not settle or double-count on a second sync", async () => {
    await executeApprovedPurchase(paypal, store, proposal.id, approval);
    await applyPayPalSync(paypal, store, range);
    const firstTotals = totals(store);
    const [firstCommitment] = store.listCommitments();

    const second = await applyPayPalSync(paypal, store, range);

    expect(second.settledCommitments).toEqual([]);
    expect(store.listCommitments()).toEqual([firstCommitment]);
    expect(totals(store)).toEqual(firstTotals);
    expect(
      store.getBalanceSheet().assets.filter((l) => l.externalId === captureId),
    ).toHaveLength(1);
  });

  it("does not re-open a settled commitment when approve is retried", async () => {
    await executeApprovedPurchase(paypal, store, proposal.id, approval);
    await applyPayPalSync(paypal, store, range);
    await executeApprovedPurchase(paypal, store, proposal.id, approval);

    expect(store.listCommitments()).toEqual([
      expect.objectContaining({ orderId, status: "settled" }),
    ]);
    expect(totals(store).pendingCommitmentsCents).toBe(0);
  });

  it("a sync before approve has no capture and settles nothing", async () => {
    const { lines, settledCommitments } = await applyPayPalSync(paypal, store, range);
    expect(lines.map((l) => l.externalId)).toEqual([
      "MOCK-TXN-001",
      "MOCK-TXN-002",
      "MOCK-TXN-003",
    ]);
    expect(settledCommitments).toEqual([]);
  });
});

describe("available vs cash math", () => {
  const sheet: BalanceSheet = {
    assets: [
      { id: "a1", name: "Checking", amountCents: 1000_00, category: "cash", source: "manual", updatedAt: "" },
      { id: "a2", name: "Brokerage", amountCents: 500_00, category: "investment", source: "manual", updatedAt: "" },
    ],
    liabilities: [
      { id: "l1", name: "Card", amountCents: 200_00, category: "credit_card", source: "manual", updatedAt: "" },
    ],
  };
  const commitment = (over: Partial<PendingCommitment>): PendingCommitment => ({
    id: "c",
    proposalId: "p",
    orderId: "ORDER-1",
    name: "x",
    amountCents: 300_00,
    currency: "USD",
    status: "pending",
    createdAt: "",
    ...over,
  });

  it("counts settled outflows off cash and keeps liabilities to real debts", () => {
    const withOutflow: BalanceSheet = {
      ...sheet,
      assets: [
        ...sheet.assets,
        { id: "o1", name: "PayPal out: Coffee", amountCents: -12_50, category: "cash", source: "paypal_sync", updatedAt: "" },
      ],
    };
    expect(balanceTotals(withOutflow, [])).toEqual({
      assetsCents: 1487_50,
      liabilitiesCents: 200_00,
      netWorthCents: 1287_50,
      liquidCashCents: 987_50,
      pendingCommitmentsCents: 0,
      availableCents: 987_50,
    });
  });

  it("subtracts only pending commitments from liquid cash", () => {
    const result = balanceTotals(sheet, [
      commitment({ id: "c1", amountCents: 300_00 }),
      commitment({ id: "c2", amountCents: 100_00, status: "settled" }),
    ]);
    expect(result).toEqual({
      assetsCents: 1500_00,
      liabilitiesCents: 200_00,
      netWorthCents: 1300_00,
      liquidCashCents: 1000_00,
      pendingCommitmentsCents: 300_00,
      availableCents: 700_00,
    });
  });

  it("matches a capture only on the same order reference and amount", () => {
    const line = {
      id: "paypal-CAP",
      name: "PayPal out: x",
      amountCents: -300_00,
      category: "cash" as const,
      source: "paypal_sync" as const,
      externalId: "CAP",
      orderReference: "ORDER-1",
      updatedAt: "",
    };
    const c = commitment({});
    expect(findSettlingLine(c, [line])).toBe(line);
    expect(findSettlingLine(c, [{ ...line, amountCents: -299_99 }])).toBeUndefined();
    expect(findSettlingLine(c, [{ ...line, amountCents: 300_00 }])).toBeUndefined();
    expect(findSettlingLine(c, [{ ...line, orderReference: "ORDER-2" }])).toBeUndefined();
    expect(findSettlingLine(c, [{ ...line, orderReference: undefined }])).toBeUndefined();
    expect(findSettlingLine(c, [{ ...line, source: "manual" }])).toBeUndefined();
  });
});
