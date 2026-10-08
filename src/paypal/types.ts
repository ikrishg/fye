import type { PayPalTransaction } from "@/domain/types";

export interface PayPalListTransactionsParams {
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
}

export interface PayPalListTransactionsResult {
  transactions: PayPalTransaction[];
  totalItems: number;
  totalPages: number;
}

export interface PayPalAdapter {
  readonly mode: "mock" | "live";
  listTransactions(
    params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult>;
  createSandboxOrder(input: {
    amountCents: number;
    currency: string;
    description: string;
    idempotencyKey: string;
  }): Promise<{ orderId: string; approvalUrl: string }>;
}

export interface PayPalEnvConfig {
  clientId: string;
  clientSecret: string;
  env: "sandbox" | "live";
}
