import type { PayPalTransaction } from "@/domain/types";
import { normalizePayPalTransaction } from "./normalize";
import type {
  PayPalAdapter,
  PayPalEnvConfig,
  PayPalListTransactionsParams,
  PayPalListTransactionsResult,
} from "./types";

async function getAccessToken(config: PayPalEnvConfig): Promise<string> {
  const base =
    config.env === "sandbox"
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal OAuth failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function apiBase(env: PayPalEnvConfig["env"]): string {
  return env === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export class LivePayPalAdapter implements PayPalAdapter {
  readonly mode: "mock" | "live" = "live";
  private readonly config: PayPalEnvConfig;

  constructor(config: PayPalEnvConfig) {
    if (config.env === "live") {
      throw new Error("Live PayPal is disabled in fye P0. Use PAYPAL_ENV=sandbox only.");
    }
    this.config = config;
  }

  async listTransactions(
    params: PayPalListTransactionsParams,
  ): Promise<PayPalListTransactionsResult> {
    const token = await getAccessToken(this.config);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 100;
    const query = new URLSearchParams({
      start_date: params.startDate,
      end_date: params.endDate,
      fields: "all",
      page_size: String(pageSize),
      page: String(page),
    });

    const response = await fetch(
      `${apiBase(this.config.env)}/v1/reporting/transactions?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PayPal list_transaction failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      transaction_details?: Array<{
        transaction_info: PayPalTransaction;
      }>;
      total_items?: number;
      total_pages?: number;
    };

    const transactions =
      data.transaction_details?.map((d) =>
        normalizePayPalTransaction(d.transaction_info),
      ) ?? [];

    return {
      transactions,
      totalItems: data.total_items ?? transactions.length,
      totalPages: data.total_pages ?? 1,
    };
  }

  async createSandboxOrder(input: {
    amountCents: number;
    currency: string;
    description: string;
    idempotencyKey: string;
  }): Promise<{ orderId: string; approvalUrl: string }> {
    const token = await getAccessToken(this.config);
    const value = (input.amountCents / 100).toFixed(2);

    const response = await fetch(
      `${apiBase(this.config.env)}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": input.idempotencyKey,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: input.currency,
                value,
              },
              description: input.description,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PayPal create order failed: ${response.status} ${text}`);
    }

    const order = (await response.json()) as {
      id: string;
      links?: Array<{ rel: string; href: string }>;
    };

    const approve = order.links?.find((l) => l.rel === "approve");
    return {
      orderId: order.id,
      approvalUrl: approve?.href ?? `https://www.sandbox.paypal.com/checkoutnow?token=${order.id}`,
    };
  }
}
