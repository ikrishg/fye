import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { z } from "zod";
import { createPurchaseProposal } from "@/agent/research";
import { AuthError } from "@/lib/auth";
import { assertOwnerAuth } from "@/lib/auth-server";
import { FYE_BASE_CURRENCY } from "@/lib/currency";
import { toPublicProposal } from "@/lib/proposal-view";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal(FYE_BASE_CURRENCY).default(FYE_BASE_CURRENCY),
});

export async function POST(request: Request) {
  try {
    await assertOwnerAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  try {
    const input = requestSchema.parse(await request.json());
    const store = getStore();
    const proposal = createPurchaseProposal(
      store.getBalanceSheet(),
      store.listCommitments(),
      input,
    );
    store.saveProposal(proposal);

    return NextResponse.json({ proposal });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid purchase request", details: err.flatten() },
        { status: 400 },
      );
    }
    throw err;
  }
}

export async function GET(request: Request) {
  try {
    await assertOwnerAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const store = getStore();
  return NextResponse.json({
    proposals: store.listProposals().map(toPublicProposal),
  });
}
