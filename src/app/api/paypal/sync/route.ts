import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { assertOwnerAuth } from "@/lib/auth-server";
import { balanceSheetPayload } from "@/lib/balance-payload";
import { withPayPalMcp } from "@/mcp/paypal/client";
import { PAYPAL_MCP_SERVER_NAME } from "@/mcp/paypal/server";
import { PAYPAL_MCP_TOOLS } from "@/mcp/paypal/tools";
import { paypalAdapterLabel } from "@/paypal/factory";
import { applyPayPalSync } from "@/paypal/sync";

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
    const { lines, settledCommitments } = await applyPayPalSync(paypal, store, range);

    return NextResponse.json({
      adapter: paypalAdapterLabel(adapter),
      mcp: {
        server: PAYPAL_MCP_SERVER_NAME,
        tool: PAYPAL_MCP_TOOLS.listTransactions,
        transactionIds: lines.map((l) => l.externalId),
      },
      syncedCount: lines.length,
      settledCommitments,
      ...balanceSheetPayload(store),
    });
  });
}
