import { describe, expect, it } from "vitest";
import type { PayPalTransaction } from "@/domain/types";
import {
  mapPayPalTransactionToLine,
  mergePayPalLines,
} from "@/paypal/sync";

describe("PayPal sync mapping", () => {
  it("maps settled inflow to cash asset", () => {
    const txn: PayPalTransaction = {
      transaction_id: "T-IN",
      transaction_status: "S",
      transaction_amount: { currency_code: "USD", value: "100.00" },
      transaction_info: { transaction_subject: "Payment received" },
    };
    const line = mapPayPalTransactionToLine(txn);
    expect(line).not.toBeNull();
    expect(line?.category).toBe("cash");
    expect(line?.amountCents).toBe(100_00);
    expect(line?.source).toBe("paypal_sync");
  });

  it("maps settled outflow to a negative cash line, not a liability", () => {
    const txn: PayPalTransaction = {
      transaction_id: "T-OUT",
      transaction_status: "S",
      transaction_amount: { currency_code: "USD", value: "-12.50" },
      transaction_info: { transaction_subject: "Coffee" },
    };
    const line = mapPayPalTransactionToLine(txn);
    expect(line?.category).toBe("cash");
    expect(line?.amountCents).toBe(-12_50);
    expect(line?.name).toBe("PayPal out: Coffee");
  });

  it("puts every synced row, in or out, on the asset (cash) side", () => {
    const lines = ["50.00", "-12.50"].map((value, i) =>
      mapPayPalTransactionToLine({
        transaction_id: `T-${i}`,
        transaction_status: "S",
        transaction_amount: { currency_code: "USD", value },
      }),
    );
    const merged = mergePayPalLines([], [], lines.filter((l) => l !== null));
    expect(merged.liabilities).toEqual([]);
    expect(merged.assets.map((a) => a.amountCents)).toEqual([50_00, -12_50]);
  });

  it("skips non-settled transactions", () => {
    const txn: PayPalTransaction = {
      transaction_id: "T-P",
      transaction_status: "P",
      transaction_amount: { currency_code: "USD", value: "-5.00" },
    };
    expect(mapPayPalTransactionToLine(txn)).toBeNull();
  });

  it("replaces prior paypal_sync lines on merge", () => {
    const existingAssets = [
      {
        id: "old-paypal",
        name: "old",
        amountCents: 1,
        category: "cash" as const,
        source: "paypal_sync" as const,
        updatedAt: "",
      },
      {
        id: "manual",
        name: "manual",
        amountCents: 100,
        category: "cash" as const,
        source: "manual" as const,
        updatedAt: "",
      },
    ];
    const newLine = {
      id: "paypal-new",
      name: "PayPal in: test",
      amountCents: 50_00,
      category: "cash" as const,
      source: "paypal_sync" as const,
      updatedAt: "",
    };
    const merged = mergePayPalLines(existingAssets, [], [newLine]);
    expect(merged.assets).toHaveLength(2);
    expect(merged.assets.some((a) => a.id === "old-paypal")).toBe(false);
    expect(merged.assets.some((a) => a.id === "manual")).toBe(true);
    expect(merged.assets.some((a) => a.id === "paypal-new")).toBe(true);
  });
});
