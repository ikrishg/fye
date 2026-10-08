import { describe, expect, it } from "vitest";
import { balanceSheetEntrySchema } from "@/domain/balance-sheet-input";

describe("balance sheet input validation", () => {
  it("rejects missing amountCents", () => {
    expect(() =>
      balanceSheetEntrySchema.parse({
        side: "asset",
        name: "Cash",
        category: "cash",
      }),
    ).toThrow();
  });

  it("rejects liability category on asset side", () => {
    expect(() =>
      balanceSheetEntrySchema.parse({
        side: "asset",
        name: "Bad",
        amountCents: 100,
        category: "loan",
      }),
    ).toThrow();
  });

  it("rejects string amounts", () => {
    expect(() =>
      balanceSheetEntrySchema.parse({
        side: "asset",
        name: "Cash",
        amountCents: "100",
        category: "cash",
      }),
    ).toThrow();
  });
});
