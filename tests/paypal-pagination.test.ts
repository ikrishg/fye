import { describe, expect, it } from "vitest";
import type { PayPalTransaction } from "@/domain/types";
import type {
  PayPalAdapter,
  PayPalListTransactionsParams,
  PayPalListTransactionsResult,
} from "@/paypal/types";
import { syncPayPalTransactions } from "@/paypal/sync";
import { connectPayPalMcp } from "@/mcp/paypal/client";
import { createMemoryStore } from "@/store/memory-store";

const TOTAL_TXNS = 150;

class PagingAdapter implements PayPalAdapter {
  readonly mode = "mock" as const;
  readonly pagesRequested: number[] = [];

  async listTransactions(
    params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 100;
    this.pagesRequested.push(page);

    const all: PayPalTransaction[] = Array.from(
      { length: TOTAL_TXNS },
      (_, i) => ({
        transaction_id: `TX-${i}`,
        transaction_status: "S",
        transaction_amount: { currency_code: "USD", value: "1.00" },
        transaction_info: { transaction_subject: `Item ${i}` },
      }),
    );

    const start = (page - 1) * pageSize;
    return {
      transactions: all.slice(start, start + pageSize),
      totalItems: all.length,
      totalPages: Math.ceil(all.length / pageSize),
    };
  }

  async createSandboxOrder(input: {
    idempotencyKey: string;
  }): Promise<{ orderId: string; approvalUrl: string }> {
    return { orderId: `order-${input.idempotencyKey}`, approvalUrl: "y" };
  }
}

describe("PayPal sync pagination", () => {
  it("requests later pages when more than 100 transactions exist", async () => {
    const adapter = new PagingAdapter();
    const paypal = await connectPayPalMcp({ adapter, store: createMemoryStore() });
    const lines = await syncPayPalTransactions(paypal, {
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-31T23:59:59Z",
    });
    await paypal.close();

    expect(lines).toHaveLength(TOTAL_TXNS);
    expect(adapter.pagesRequested).toEqual([1, 2]);
  });
});
