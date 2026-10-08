import { describe, expect, it } from "vitest";
import type { PayPalTransaction } from "@/domain/types";
import type {
  PayPalAdapter,
  PayPalListTransactionsParams,
  PayPalListTransactionsResult,
} from "@/paypal/types";
import { syncPayPalTransactions } from "@/paypal/sync";

class PagingAdapter implements PayPalAdapter {
  readonly mode = "mock" as const;

  async listTransactions(
    params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 2;
    const all: PayPalTransaction[] = Array.from({ length: 5 }, (_, i) => ({
      transaction_id: `TX-${i}`,
      transaction_status: "S",
      transaction_amount: { currency_code: "USD", value: "1.00" },
      transaction_info: { transaction_subject: `Item ${i}` },
    }));

    const start = (page - 1) * pageSize;
    return {
      transactions: all.slice(start, start + pageSize),
      totalItems: all.length,
      totalPages: Math.ceil(all.length / pageSize),
    };
  }

  async createSandboxOrder(): Promise<{ orderId: string; approvalUrl: string }> {
    return { orderId: "x", approvalUrl: "y" };
  }
}

describe("PayPal sync pagination", () => {
  it("fetches every page before mapping", async () => {
    const lines = await syncPayPalTransactions(new PagingAdapter(), {
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-31T23:59:59Z",
    });
    expect(lines).toHaveLength(5);
  });
});
