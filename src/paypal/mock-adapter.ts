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
const ordersByIdempotencyKey = new Map<
  string,
  { orderId: string; approvalUrl: string }
>();

export class MockPayPalAdapter implements PayPalAdapter {
  readonly mode = "mock";

  async listTransactions(
    params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult> {
    const pageSize = params.pageSize ?? 100;
    const page = params.page ?? 1;
    const totalItems = allFixtureTxns.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = (page - 1) * pageSize;
    const transactions = allFixtureTxns.slice(start, start + pageSize);

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
      return cached;
    }

    const orderId = `MOCK-ORDER-${input.idempotencyKey.slice(0, 8)}`;
    const value = (input.amountCents / 100).toFixed(2);
    const result = {
      orderId,
      approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=MOCK&amount=${value}&currency=${input.currency}&desc=${encodeURIComponent(input.description)}`,
    };
    ordersByIdempotencyKey.set(input.idempotencyKey, result);
    return result;
  }
}

export function resetMockPayPalOrders(): void {
  ordersByIdempotencyKey.clear();
}
