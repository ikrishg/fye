import { balanceTotals } from "@/domain/commitments";
import type { FyeStore } from "@/store/memory-store";

export function balanceSheetPayload(store: FyeStore) {
  const sheet = store.getBalanceSheet();
  const commitments = store.listCommitments();
  return {
    sheet,
    commitments: commitments.filter((c) => c.status === "pending"),
    totals: balanceTotals(sheet, commitments),
  };
}
