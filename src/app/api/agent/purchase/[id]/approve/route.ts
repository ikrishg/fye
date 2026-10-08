import { NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalGateError, executeApprovedPurchase } from "@/agent/purchase";
import { AuthError } from "@/lib/auth";
import { assertOwnerAuth } from "@/lib/auth-server";
import { toPublicProposal } from "@/lib/proposal-view";
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
  try {
    await assertOwnerAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const { id } = await context.params;
  const input = approvalSchema.parse(await request.json());
  const store = getStore();

  try {
    const adapter = createPayPalAdapter();
    const updated = await executeApprovedPurchase(
      store,
      adapter,
      id,
      input,
    );
    return NextResponse.json({ proposal: toPublicProposal(updated) });
  } catch (err) {
    if (err instanceof ApprovalGateError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
