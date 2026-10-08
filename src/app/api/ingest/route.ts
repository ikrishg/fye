import { NextResponse } from "next/server";
import { ingestToBalanceLine, parseIngestBody } from "@/ingest/service";
import { getStore } from "@/store/memory-store";
import { netWorthCents, sumAssets, sumLiabilities } from "@/domain/balance-sheet";

export const runtime = "nodejs";

/**
 * iMessage ingest stand-in: same contract a future bridge would call.
 * POST JSON { kind, amountCents, currency, description, merchant?, rawText?, messageId? }
 */
export async function POST(request: Request) {
  const payload = parseIngestBody(await request.json());
  const line = ingestToBalanceLine(payload);
  const store = getStore();
  store.addIngestLiability(line);

  const sheet = store.getBalanceSheet();
  return NextResponse.json({
    ingested: line,
    sheet,
    totals: {
      assetsCents: sumAssets(sheet),
      liabilitiesCents: sumLiabilities(sheet),
      netWorthCents: netWorthCents(sheet),
    },
  });
}
