import {
  netWorthCents,
  sumAssets,
  sumLiabilities,
} from "@/domain/balance-sheet";
import type {
  BalanceSheet,
  PurchaseProposal,
  PurchaseResearchRequest,
} from "@/domain/types";
import { v4 as uuidv4 } from "uuid";

export interface ResearchResult {
  summary: string;
  balanceBeforeCents: number;
  netWorthBeforeCents: number;
  projectedNetWorthCents: number;
  canAfford: boolean;
  warnings: string[];
}

export function researchPurchase(
  sheet: BalanceSheet,
  request: PurchaseResearchRequest,
): ResearchResult {
  const cashAssets = sheet.assets
    .filter((a) => a.category === "cash")
    .reduce((s, a) => s + a.amountCents, 0);

  const totalAssets = sumAssets(sheet);
  const totalLiabilities = sumLiabilities(sheet);
  const netBefore = netWorthCents(sheet);
  const projectedLiabilities = totalLiabilities + request.amountCents;
  const projectedNet = totalAssets - projectedLiabilities;

  const warnings: string[] = [];

  if (request.amountCents > cashAssets) {
    warnings.push(
      `Purchase (${formatMoney(request.amountCents)}) exceeds liquid cash (${formatMoney(cashAssets)}).`,
    );
  }

  if (projectedNet < 0) {
    warnings.push("Projected net worth would be negative after this purchase.");
  }

  if (request.amountCents > netBefore * 0.1 && netBefore > 0) {
    warnings.push("Purchase is more than 10% of current net worth.");
  }

  const canAfford =
    request.amountCents <= cashAssets && projectedNet >= 0;

  const summary = [
    `Research for "${request.description}" (${formatMoney(request.amountCents)} ${request.currency}).`,
    `Assets: ${formatMoney(totalAssets)} | Liabilities: ${formatMoney(totalLiabilities)} | Net worth: ${formatMoney(netBefore)}.`,
    `Liquid cash (cash-category assets): ${formatMoney(cashAssets)}.`,
    `If recorded as new liability: projected net worth ${formatMoney(projectedNet)}.`,
    canAfford
      ? "Recommendation: affordable against current balances."
      : "Recommendation: not affordable without moving funds or reducing other obligations.",
  ].join(" ");

  return {
    summary,
    balanceBeforeCents: cashAssets,
    netWorthBeforeCents: netBefore,
    projectedNetWorthCents: projectedNet,
    canAfford,
    warnings,
  };
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function createPurchaseProposal(
  sheet: BalanceSheet,
  request: PurchaseResearchRequest,
): PurchaseProposal {
  const research = researchPurchase(sheet, request);
  return {
    id: uuidv4(),
    request,
    research,
    status: "pending_approval",
    approvalToken: uuidv4(),
    createdAt: new Date().toISOString(),
  };
}
