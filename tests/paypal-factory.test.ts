import { afterEach, describe, expect, it, vi } from "vitest";
import { connectPayPalMcp } from "@/mcp/paypal/client";
import { createPayPalAdapter, readPayPalEnv } from "@/paypal/factory";
import { createMemoryStore } from "@/store/memory-store";

const ENV_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_ENV"] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, values[key] ?? "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PayPal fixture/live switch", () => {
  it("uses fixtures when no credentials are set", () => {
    setEnv({});
    expect(readPayPalEnv()).toBeNull();
    expect(createPayPalAdapter().mode).toBe("mock");
  });

  it("uses fixtures when credentials are partial", () => {
    setEnv({ PAYPAL_CLIENT_ID: "id", PAYPAL_ENV: "sandbox" });
    expect(createPayPalAdapter().mode).toBe("mock");
  });

  it("uses the sandbox adapter only with id + secret + PAYPAL_ENV=sandbox", () => {
    setEnv({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_ENV: "sandbox" });
    expect(createPayPalAdapter().mode).toBe("live");
  });

  it("rejects production PayPal", () => {
    setEnv({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_ENV: "live" });
    expect(() => createPayPalAdapter()).toThrow(/sandbox only/i);
  });

  it("rejects unknown PAYPAL_ENV values", () => {
    setEnv({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_ENV: "prod" });
    expect(() => createPayPalAdapter()).toThrow(/sandbox or live/);
  });

  it("fixture mode makes no network calls through MCP", async () => {
    setEnv({});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const paypal = await connectPayPalMcp({ adapter: createPayPalAdapter(), store: createMemoryStore() });
    try {
      await paypal.listTransactions();
    } finally {
      await paypal.close();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sandbox mode list_transactions only targets the sandbox host (stubbed fetch)", async () => {
    setEnv({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_ENV: "sandbox" });
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const body = url.includes("/oauth2/token")
          ? { access_token: "stub" }
          : {
              transaction_details: [
                {
                  transaction_info: {
                    transaction_id: "SANDBOX-1",
                    transaction_status: "S",
                    transaction_amount: { currency_code: "USD", value: "1.00" },
                  },
                },
              ],
              total_items: 1,
              total_pages: 1,
            };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const paypal = await connectPayPalMcp({ adapter: createPayPalAdapter(), store: createMemoryStore() });
    try {
      const result = await paypal.listTransactions();
      expect(result.mode).toBe("live");
      expect(result.transaction_details.map((t) => t.transaction_id)).toEqual(["SANDBOX-1"]);
    } finally {
      await paypal.close();
    }
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("https://api-m.sandbox.paypal.com/")).toBe(true);
    }
  });
});
