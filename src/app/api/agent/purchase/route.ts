import { NextResponse } from "next/server";
import { z } from "zod";
import { createPurchaseProposal } from "@/agent/research";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional().default("USD"),
});

export async function POST(request: Request) {
  const input = requestSchema.parse(await request.json());
  const store = getStore();
  const sheet = store.getBalanceSheet();
  const proposal = createPurchaseProposal(sheet, input);
  store.saveProposal(proposal);

  return NextResponse.json({ proposal });
}

export async function GET() {
  const store = getStore();
  return NextResponse.json({ proposals: store.listProposals() });
}
