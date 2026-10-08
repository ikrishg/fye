import { randomUUID } from "node:crypto";
import type {
  BalanceSheetLine,
  PayPalTransaction,
  PendingCommitment,
} from "@/domain/types";
import { FYE_BASE_CURRENCY } from "@/lib/currency";
import type { PayPalMcpClient } from "@/mcp/paypal/client";
import type { FyeStore } from "@/store/memory-store";

/**
 * Map a PayPal reporting transaction to a cash line with a signed amount in
 * cents: inflows add cash, settled outflows are cash that left (negative),
 * never a liability.
 */
export function mapPayPalTransactionToLine(
  txn: PayPalTransaction,
): BalanceSheetLine | null {
  if (txn.transaction_status !== "S") {
    return null;
  }

  if (txn.transaction_amount.currency_code !== FYE_BASE_CURRENCY) {
    return null;
  }

  const value = parseFloat(txn.transaction_amount.value);
  if (Number.isNaN(value)) {
    return null;
  }

  const amountCents = Math.round(value * 100);
  const subject =
    txn.transaction_info?.transaction_subject ??
    txn.transaction_event_code ??
    "PayPal transaction";

  const name =
    amountCents >= 0
      ? `PayPal in: ${subject}`
      : `Cash out: ${subject}`;

  return {
    id: `paypal-${txn.transaction_id}`,
    name,
    amountCents,
    category: "cash",
    source: "paypal_sync",
    externalId: txn.transaction_id,
    ...(txn.transaction_info?.paypal_reference_id
      ? { orderReference: txn.transaction_info.paypal_reference_id }
      : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function mergePayPalLines(
  existingAssets: BalanceSheetLine[],
  existingLiabilities: BalanceSheetLine[],
  newLines: BalanceSheetLine[],
): { assets: BalanceSheetLine[]; liabilities: BalanceSheetLine[] } {
  const assets = existingAssets.filter((l) => l.source !== "paypal_sync");
  const liabilities = existingLiabilities.filter((l) => l.source !== "paypal_sync");

  for (const line of newLines) {
    if (line.category === "cash" || line.category === "investment") {
      assets.push(line);
    } else {
      liabilities.push(line);
    }
  }

  return { assets, liabilities };
}

export async function syncPayPalTransactions(
  paypal: Pick<PayPalMcpClient, "listTransactions">,
  range: { startDate: string; endDate: string },
): Promise<BalanceSheetLine[]> {
  const pageSize = 100;
  let page = 1;
  let totalPages = 1;
  const allTransactions: PayPalTransaction[] = [];

  do {
    const result = await paypal.listTransactions({
      start_date: range.startDate,
      end_date: range.endDate,
      page,
      page_size: pageSize,
    });
    allTransactions.push(...result.transaction_details);
    totalPages = result.total_pages;
    page += 1;
  } while (page <= totalPages);

  const lines: BalanceSheetLine[] = [];
  for (const txn of allTransactions) {
    const line = mapPayPalTransactionToLine(txn);
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Replaces the sheet's paypal_sync rows with the latest list_transactions
 * result, then settles pending commitments that the synced rows capture.
 * Running it twice with the same data leaves the sheet and commitments unchanged.
 */
export async function applyPayPalSync(
  paypal: Pick<PayPalMcpClient, "listTransactions">,
  store: FyeStore,
  range: { startDate: string; endDate: string },
): Promise<{ lines: BalanceSheetLine[]; settledCommitments: PendingCommitment[] }> {
  const lines = await syncPayPalTransactions(paypal, range);
  const current = store.getBalanceSheet();
  const merged = mergePayPalLines(current.assets, current.liabilities, lines);
  store.replacePayPalSync(merged.assets, merged.liabilities);
  const settledCommitments = store.settleCommitments(lines);
  return { lines, settledCommitments };
}

/** Ingest-side: record a single PayPal-style spend as liability line */
export function mapIngestSpendToLiability(input: {
  amountCents: number;
  description: string;
  messageId?: string;
}): BalanceSheetLine {
  const id = input.messageId
    ? `ingest-${input.messageId}`
    : `ingest-${randomUUID()}`;

  return {
    id,
    name: input.description,
    amountCents: input.amountCents,
    category: "other_liability",
    source: "imessage_ingest",
    externalId: input.messageId,
    updatedAt: new Date().toISOString(),
  };
}
