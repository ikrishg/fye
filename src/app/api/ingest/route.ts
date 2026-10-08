import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildIngestApiResponse } from "@/ingest/response";
import { ingestToBalanceLine, parseIngestBody } from "@/ingest/service";
import { AuthError } from "@/lib/auth";
import { assertIngestOrOwnerAuth } from "@/lib/auth-server";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

/**
 * iMessage ingest stand-in: same contract a future bridge would call.
 * POST JSON { kind, amountCents, currency, description, merchant?, rawText?, messageId? }
 */
export async function POST(request: Request) {
  try {
    await assertIngestOrOwnerAuth(request);
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

    return NextResponse.json(buildIngestApiResponse(result));
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
