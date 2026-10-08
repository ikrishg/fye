import { LivePayPalAdapter } from "./live-adapter";
import { MockPayPalAdapter } from "./mock-adapter";
import type { PayPalAdapter, PayPalEnvConfig } from "./types";

export function readPayPalEnv(): PayPalEnvConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const env = process.env.PAYPAL_ENV?.trim() as "sandbox" | "live" | undefined;

  if (!clientId || !clientSecret || !env) {
    return null;
  }

  if (env !== "sandbox" && env !== "live") {
    throw new Error("PAYPAL_ENV must be sandbox or live");
  }

  return { clientId, clientSecret, env };
}

export function createPayPalAdapter(): PayPalAdapter {
  const config = readPayPalEnv();
  if (!config) {
    return new MockPayPalAdapter();
  }
  return new LivePayPalAdapter(config);
}

export function paypalAdapterLabel(adapter: PayPalAdapter): string {
  return adapter.mode === "mock"
    ? "mock (fixture transactions — set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox to swap)"
    : "sandbox API";
}
