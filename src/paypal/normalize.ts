import type { PayPalTransaction } from "@/domain/types";

/** Raw PayPal reporting row (flat or nested fields). */
export type PayPalReportingTransactionRaw = PayPalTransaction & {
  transaction_subject?: string;
  paypal_reference_id?: string;
};

/** PayPal reporting API nests fields under transaction_info; normalize to mapper shape. */
export function normalizePayPalTransaction(
  raw: PayPalReportingTransactionRaw,
): PayPalTransaction {
  const subject =
    raw.transaction_info?.transaction_subject ?? raw.transaction_subject;

  const reference =
    raw.transaction_info?.paypal_reference_id ?? raw.paypal_reference_id;

  return {
    ...raw,
    transaction_info: {
      ...raw.transaction_info,
      transaction_subject: subject,
      paypal_reference_id: reference,
    },
  };
}
