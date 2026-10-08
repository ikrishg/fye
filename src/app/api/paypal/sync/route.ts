import { NextResponse } from "next/server";
import { netWorthCents, sumAssets, sumLiabilities } from "@/domain/balance-sheet";
import { AuthError } from "@/lib/auth";
import { assertOwnerAuth } from "@/lib/auth-server";
import { withPayPalMcp } from "@/mcp/paypal/client";
import { PAYPAL_MCP_SERVER_NAME } from "@/mcp/paypal/server";
import { PAYPAL_MCP_TOOLS } from "@/mcp/paypal/tools";
import { paypalAdapterLabel } from "@/paypal/factory";
import { mergePayPalLines, syncPayPalTransactions } from "@/paypal/sync";

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

  let range = defaultDateRange();

  try {
    const body = await request.json();
    if (body?.startDate && body?.endDate) {
      range = { startDate: body.startDate, endDate: body.endDate };
    }
  } catch {
    // empty body ok
  }

  return withPayPalMcp(async (paypal, { adapter, store }) => {
    const lines = await syncPayPalTransactions(paypal, range);
    const current = store.getBalanceSheet();
    const merged = mergePayPalLines(current.assets, current.liabilities, lines);
    store.replacePayPalSync(merged.assets, merged.liabilities);

    const sheet = store.getBalanceSheet();
    return NextResponse.json({
      adapter: paypalAdapterLabel(adapter),
      mcp: {
        server: PAYPAL_MCP_SERVER_NAME,
        tool: PAYPAL_MCP_TOOLS.listTransactions,
        transactionIds: lines.map((l) => l.externalId),
      },
      syncedCount: lines.length,
      sheet,
      totals: {
        assetsCents: sumAssets(sheet),
        liabilitiesCents: sumLiabilities(sheet),
        netWorthCents: netWorthCents(sheet),
      },
    });
  });
}
