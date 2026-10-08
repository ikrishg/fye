import { NextResponse } from "next/server";
import { netWorthCents, sumAssets, sumLiabilities } from "@/domain/balance-sheet";
import { AuthError } from "@/lib/auth";
import { assertOwnerAuth } from "@/lib/auth-server";
import { createPayPalAdapter, paypalAdapterLabel } from "@/paypal/factory";
import { mergePayPalLines, syncPayPalTransactions } from "@/paypal/sync";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

function defaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    await assertOwnerAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const adapter = createPayPalAdapter();
  let range = defaultDateRange();

  try {
    const body = await request.json();
    if (body?.startDate && body?.endDate) {
      range = { startDate: body.startDate, endDate: body.endDate };
    }
  } catch {
    // empty body ok
  }

  const lines = await syncPayPalTransactions(adapter, range);
  const store = getStore();
  const current = store.getBalanceSheet();
  const merged = mergePayPalLines(current.assets, current.liabilities, lines);
  store.replacePayPalSync(merged.assets, merged.liabilities);

  const sheet = store.getBalanceSheet();
  return NextResponse.json({
    adapter: paypalAdapterLabel(adapter),
    syncedCount: lines.length,
    sheet,
    totals: {
      assetsCents: sumAssets(sheet),
      liabilitiesCents: sumLiabilities(sheet),
      netWorthCents: netWorthCents(sheet),
    },
  });
}
