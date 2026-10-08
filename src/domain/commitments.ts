import {
  isLiabilityCategory,
  netWorthCents,
  sumAssets,
  sumLiabilities,
} from "./balance-sheet";
import type { BalanceSheet, BalanceSheetLine, PendingCommitment } from "./types";

export function commitmentIdForOrder(orderId: string): string {
  return `commitment-${orderId}`;
}

export function liquidCashCents(sheet: BalanceSheet): number {
  return sheet.assets
    .filter((a) => a.category === "cash")
    .reduce((sum, a) => sum + a.amountCents, 0);
}

export function pendingCommitmentsCents(commitments: PendingCommitment[]): number {
  return commitments
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + c.amountCents, 0);
}

export interface BalanceTotals {
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  liquidCashCents: number;
  pendingCommitmentsCents: number;
  availableCents: number;
}

/** Pending commitments only reduce `availableCents`; cash and net worth ignore them. */
export function balanceTotals(
  sheet: BalanceSheet,
  commitments: PendingCommitment[],
): BalanceTotals {
  const liquid = liquidCashCents(sheet);
  const pending = pendingCommitmentsCents(commitments);
  return {
    assetsCents: sumAssets(sheet),
    liabilitiesCents: sumLiabilities(sheet),
    netWorthCents: netWorthCents(sheet),
    liquidCashCents: liquid,
    pendingCommitmentsCents: pending,
    availableCents: liquid - pending,
  };
}

/**
 * The synced PayPal outflow that captures this commitment's order: same order
 * reference and same amount.
 */
export function findSettlingLine(
  commitment: PendingCommitment,
  lines: BalanceSheetLine[],
): BalanceSheetLine | undefined {
  return lines.find(
    (line) =>
      line.source === "paypal_sync" &&
      isLiabilityCategory(line.category) &&
      line.orderReference === commitment.orderId &&
      line.amountCents === commitment.amountCents,
  );
}
