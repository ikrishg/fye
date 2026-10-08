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

export class MockPayPalAdapter implements PayPalAdapter {
  readonly mode = "mock";

  async listTransactions(
    _params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult> {
    const transactions = normalizeFixture();
    return {
      transactions,
      totalItems: fixture.total_items,
      totalPages: fixture.total_pages,
    };
  }

  async createSandboxOrder(input: {
    amountCents: number;
    currency: string;
    description: string;
  }): Promise<{ orderId: string; approvalUrl: string }> {
    const orderId = `MOCK-ORDER-${Date.now()}`;
    const value = (input.amountCents / 100).toFixed(2);
    return {
      orderId,
      approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=MOCK&amount=${value}&currency=${input.currency}&desc=${encodeURIComponent(input.description)}`,
    };
  }
}
