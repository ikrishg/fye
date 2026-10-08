#!/usr/bin/env npx tsx
/**
 * CLI stand-in for iMessage → fye ingest (calls same API contract as webhook).
 *
 * Usage:
 *   FYE_BASE_URL=http://localhost:3000 npm run ingest -- --amount 48 --desc "Dinner"
 */

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

async function main() {
  const base = process.env.FYE_BASE_URL ?? "http://localhost:3000";
  const amountStr = getArg("amount") ?? "25";
  const desc = getArg("desc") ?? "Coffee receipt";
  const amountCents = Math.round(parseFloat(amountStr) * 100);

  const payload = {
    kind: "receipt" as const,
    amountCents,
    currency: "USD",
    description: desc,
    merchant: "cli",
    messageId: `cli-${Date.now()}`,
  };

  const res = await fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(res.status, text);
    process.exit(1);
  }
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
