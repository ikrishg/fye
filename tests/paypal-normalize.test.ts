import { describe, expect, it } from "vitest";
import {
  normalizePayPalTransaction,
  type PayPalReportingTransactionRaw,
} from "@/paypal/normalize";
import { mapPayPalTransactionToLine } from "@/paypal/sync";

describe("PayPal sandbox normalization", () => {
  it("maps transaction_subject from flat sandbox records", () => {
    const raw: PayPalReportingTransactionRaw = {
      transaction_id: "SBOX-1",
      transaction_status: "S",
      transaction_amount: { currency_code: "USD", value: "-4.00" },
      transaction_subject: "Readable label",
      transaction_event_code: "T0006",
    };
    const normalized = normalizePayPalTransaction(raw);

    const line = mapPayPalTransactionToLine(normalized);
    expect(line?.name).toContain("Readable label");
  });
});
