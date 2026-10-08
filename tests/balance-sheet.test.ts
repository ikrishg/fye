import { describe, expect, it } from "vitest";
import {
  createManualAsset,
  createManualLiability,
  netWorthCents,
  sumAssets,
  sumLiabilities,
} from "@/domain/balance-sheet";
import type { BalanceSheet } from "@/domain/types";

describe("balance sheet math", () => {
  const sheet: BalanceSheet = {
    assets: [
      createManualAsset({
        id: "a1",
        name: "Cash",
        amountCents: 100_00,
        category: "cash",
      }),
      createManualAsset({
        id: "a2",
        name: "Brokerage",
        amountCents: 250_00,
        category: "investment",
      }),
    ],
    liabilities: [
      createManualLiability({
        id: "l1",
        name: "Card",
        amountCents: 50_00,
        category: "credit_card",
      }),
    ],
  };

  it("sums assets and liabilities", () => {
    expect(sumAssets(sheet)).toBe(350_00);
    expect(sumLiabilities(sheet)).toBe(50_00);
  });

  it("computes net worth", () => {
    expect(netWorthCents(sheet)).toBe(300_00);
  });

  it("rejects liability category on asset helper", () => {
    expect(() =>
      createManualAsset({
        id: "x",
        name: "Bad",
        amountCents: 1,
        category: "loan",
      }),
    ).toThrow();
  });
});
