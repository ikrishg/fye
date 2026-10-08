import { balanceTotals } from "@/domain/commitments";
import type {
  BalanceSheet,
  PendingCommitment,
  PurchaseProposal,
  PurchaseResearchRequest,
} from "@/domain/types";
import { v4 as uuidv4 } from "uuid";

export interface ResearchResult {
  summary: string;
  /** Available balance: liquid cash minus pending commitments. */
  balanceBeforeCents: number;
  netWorthBeforeCents: number;
  projectedNetWorthCents: number;
  canAfford: boolean;
  warnings: string[];
}

/**
 * Checks a purchase against Available, so open commitments from earlier
 * approvals count as already spent. The projection assumes those commitments
 * and this purchase all settle as cash leaving.
 */
export function researchPurchase(
  sheet: BalanceSheet,
  commitments: PendingCommitment[],
  request: PurchaseResearchRequest,
): ResearchResult {
  const totals = balanceTotals(sheet, commitments);
  const available = totals.availableCents;
  const netBefore = totals.netWorthCents;
  const projectedNet =
    netBefore - totals.pendingCommitmentsCents - request.amountCents;

  const warnings: string[] = [];

  if (request.amountCents > available) {
    warnings.push(
      `Purchase (${formatMoney(request.amountCents)}) exceeds available balance (${formatMoney(available)}).`,
    );
  }

  if (projectedNet < 0) {
    warnings.push("Projected net worth would be negative after this purchase.");
  }

  if (request.amountCents > netBefore * 0.1 && netBefore > 0) {
    warnings.push("Purchase is more than 10% of current net worth.");
  }

  const canAfford = request.amountCents <= available && projectedNet >= 0;

  const summary = [
    `Research for "${request.description}" (${formatMoney(request.amountCents)} ${request.currency}).`,
    `Assets: ${formatMoney(totals.assetsCents)} | Liabilities: ${formatMoney(totals.liabilitiesCents)} | Net worth: ${formatMoney(netBefore)}.`,
    `Liquid cash: ${formatMoney(totals.liquidCashCents)} | Pending commitments: ${formatMoney(totals.pendingCommitmentsCents)} | Available: ${formatMoney(available)}.`,
    `After this purchase and pending commitments settle: available ${formatMoney(available - request.amountCents)}, projected net worth ${formatMoney(projectedNet)}.`,
    canAfford
      ? "Recommendation: affordable against available balance."
      : "Recommendation: not affordable against available balance without moving funds or reducing other obligations.",
  ].join(" ");

  return {
    summary,
    balanceBeforeCents: available,
    netWorthBeforeCents: netBefore,
    projectedNetWorthCents: projectedNet,
    canAfford,
    warnings,
  };
}

function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function createPurchaseProposal(
  sheet: BalanceSheet,
  commitments: PendingCommitment[],
  request: PurchaseResearchRequest,
): PurchaseProposal {
  const research = researchPurchase(sheet, commitments, request);
  return {
    id: uuidv4(),
    request,
    research,
    status: "pending_approval",
    approvalToken: uuidv4(),
    createdAt: new Date().toISOString(),
  };
}
