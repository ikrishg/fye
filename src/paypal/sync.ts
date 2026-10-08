import { v4 as uuidv4 } from "uuid";
import type { BalanceSheetLine, PayPalTransaction } from "@/domain/types";
import type { PayPalAdapter } from "./types";

/** Map PayPal reporting transaction to a balance-sheet cash line (signed amount in cents). */
export function mapPayPalTransactionToLine(
  txn: PayPalTransaction,
): BalanceSheetLine | null {
  if (txn.transaction_status !== "S") {
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
      : `PayPal out: ${subject}`;

  return {
    id: `paypal-${txn.transaction_id}`,
    name,
    amountCents: Math.abs(amountCents),
    category: amountCents >= 0 ? "cash" : "other_liability",
    source: "paypal_sync",
    externalId: txn.transaction_id,
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
  adapter: PayPalAdapter,
  range: { startDate: string; endDate: string },
): Promise<BalanceSheetLine[]> {
  const result = await adapter.listTransactions({
    startDate: range.startDate,
    endDate: range.endDate,
  });

  const lines: BalanceSheetLine[] = [];
  for (const txn of result.transactions) {
    const line = mapPayPalTransactionToLine(txn);
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

/** Ingest-side: record a single PayPal-style spend as liability line */
export function mapIngestSpendToLiability(input: {
  amountCents: number;
  description: string;
  messageId?: string;
}): BalanceSheetLine {
  return {
    id: uuidv4(),
    name: input.description,
    amountCents: input.amountCents,
    category: "other_liability",
    source: "imessage_ingest",
    externalId: input.messageId,
    updatedAt: new Date().toISOString(),
  };
}
