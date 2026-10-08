import type { PayPalTransaction } from "@/domain/types";

/** PayPal reporting API nests fields under transaction_info; normalize to mapper shape. */
export function normalizePayPalTransaction(
  raw: PayPalTransaction,
): PayPalTransaction {
  const nested = raw as PayPalTransaction & {
    transaction_subject?: string;
    paypal_reference_id?: string;
  };

  const subject =
    raw.transaction_info?.transaction_subject ?? nested.transaction_subject;

  const reference =
    raw.transaction_info?.paypal_reference_id ?? nested.paypal_reference_id;

  return {
    ...raw,
    transaction_info: {
      ...raw.transaction_info,
      transaction_subject: subject,
      paypal_reference_id: reference,
    },
  };
}
