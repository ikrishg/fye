import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { netWorthCents, sumAssets, sumLiabilities } from "@/domain/balance-sheet";
import { ingestToBalanceLine, parseIngestBody } from "@/ingest/service";
import { AuthError } from "@/lib/auth";
import { assertIngestAuth } from "@/lib/auth-server";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

/**
 * iMessage ingest stand-in: same contract a future bridge would call.
 * POST JSON { kind, amountCents, currency, description, merchant?, rawText?, messageId? }
 */
export async function POST(request: Request) {
  try {
    await assertIngestAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  try {
    const payload = parseIngestBody(await request.json());
    const line = ingestToBalanceLine(payload);
    const store = getStore();
    const result = store.addIngestLiability(line);

    const sheet = store.getBalanceSheet();
    return NextResponse.json({
      ingested: result.line,
      duplicate: result.duplicate,
      sheet,
      totals: {
        assetsCents: sumAssets(sheet),
        liabilitiesCents: sumLiabilities(sheet),
        netWorthCents: netWorthCents(sheet),
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid ingest payload", details: err.flatten() },
        { status: 400 },
      );
    }
    throw err;
  }
}
