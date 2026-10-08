import { NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalGateError, executeApprovedPurchase } from "@/agent/purchase";
import { createPayPalAdapter } from "@/paypal/factory";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

const approvalSchema = z.object({
  approved: z.boolean(),
  approvalToken: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const input = approvalSchema.parse(await request.json());
  const store = getStore();
  const proposal = store.getProposal(id);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  try {
    const adapter = createPayPalAdapter();
    const updated = await executeApprovedPurchase(adapter, proposal, input);
    store.saveProposal(updated);
    return NextResponse.json({ proposal: updated });
  } catch (err) {
    if (err instanceof ApprovalGateError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
