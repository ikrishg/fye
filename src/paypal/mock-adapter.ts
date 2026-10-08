import type { PayPalTransaction } from "@/domain/types";
import fixture from "./fixtures/transactions.json";
import type {
  PayPalAdapter,
  PayPalListTransactionsParams,
  PayPalListTransactionsResult,
} from "./types";

function normalizeFixture(): PayPalTransaction[] {
  return fixture.transaction_details.map((row) => ({
    transaction_id: row.transaction_info.transaction_id,
    transaction_status: row.transaction_info.transaction_status,
    transaction_amount: row.transaction_info.transaction_amount,
    transaction_info: {
      transaction_subject: row.transaction_info.transaction_subject,
    },
    payer_info: row.payer_info,
    transaction_event_code: row.transaction_info.transaction_event_code,
  }));
}

const allFixtureTxns = normalizeFixture();

interface MockOrder {
  orderId: string;
  approvalUrl: string;
  capture: PayPalTransaction;
}

const ordersByIdempotencyKey = new Map<string, MockOrder>();

export const MOCK_APPROVAL_HOST = "mock-paypal.invalid";

/**
 * Fixture capture for a mock order, standing in for the buyer paying through
 * the approve link. Shaped like a PayPal reporting row: `paypal_reference_id`
 * is the order id, and the amount is the order total as an outflow.
 */
function fixtureCapture(input: {
  key: string;
  orderId: string;
  value: string;
  currency: string;
  description: string;
}): PayPalTransaction {
  return {
    transaction_id: `MOCK-CAP-${input.key.slice(0, 8)}`,
    transaction_status: "S",
    transaction_event_code: "T0006",
    transaction_amount: { currency_code: input.currency, value: `-${input.value}` },
    transaction_info: {
      transaction_subject: input.description,
      paypal_reference_id: input.orderId,
    },
  };
}

export class MockPayPalAdapter implements PayPalAdapter {
  readonly mode = "mock";

  async listTransactions(
    params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult> {
    const all = [
      ...allFixtureTxns,
      ...[...ordersByIdempotencyKey.values()].map((o) => o.capture),
    ];
    const pageSize = params.pageSize ?? 100;
    const page = params.page ?? 1;
    const totalItems = all.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = (page - 1) * pageSize;
    const transactions = all.slice(start, start + pageSize);

    return {
      transactions,
      totalItems,
      totalPages,
    };
  }

  async createSandboxOrder(input: {
    amountCents: number;
    currency: string;
    description: string;
    idempotencyKey: string;
  }): Promise<{ orderId: string; approvalUrl: string }> {
    const cached = ordersByIdempotencyKey.get(input.idempotencyKey);
    if (cached) {
      return { orderId: cached.orderId, approvalUrl: cached.approvalUrl };
    }

    const orderId = `MOCK-ORDER-${input.idempotencyKey.slice(0, 8)}`;
    const value = (input.amountCents / 100).toFixed(2);
    const order: MockOrder = {
      orderId,
      approvalUrl: `https://${MOCK_APPROVAL_HOST}/checkoutnow?token=${orderId}`,
      capture: fixtureCapture({
        key: input.idempotencyKey,
        orderId,
        value,
        currency: input.currency,
        description: input.description,
      }),
    };
    ordersByIdempotencyKey.set(input.idempotencyKey, order);
    return { orderId: order.orderId, approvalUrl: order.approvalUrl };
  }
}

export function resetMockPayPalOrders(): void {
  ordersByIdempotencyKey.clear();
}
