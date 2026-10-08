import { randomUUID } from "node:crypto";
import type { BalanceSheetLine, PayPalTransaction } from "@/domain/types";
import { FYE_BASE_CURRENCY } from "@/lib/currency";
import type { PayPalMcpClient } from "@/mcp/paypal/client";

/** Map PayPal reporting transaction to a balance-sheet cash line (signed amount in cents). */
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
