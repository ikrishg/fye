import { describe, expect, it } from "vitest";
import type { PayPalTransaction } from "@/domain/types";
import { ingestPayloadSchema } from "@/ingest/service";
import { mapPayPalTransactionToLine } from "@/paypal/sync";

describe("currency guards", () => {
  it("skips non-USD PayPal transactions", () => {
    const txn: PayPalTransaction = {
      transaction_id: "eur-1",
      transaction_status: "S",
      transaction_amount: { currency_code: "EUR", value: "-10.00" },
    };
    expect(mapPayPalTransactionToLine(txn)).toBeNull();
  });

  it("rejects non-USD ingest payloads", () => {
    expect(() =>
      ingestPayloadSchema.parse({
        kind: "receipt",
        amountCents: 100,
        currency: "EUR",
        description: "Coffee",
      }),
    ).toThrow();
  });
});
