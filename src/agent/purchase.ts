import type { PayPalAdapter } from "@/paypal/types";
import type { PurchaseProposal } from "@/domain/types";

export class ApprovalGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalGateError";
  }
}

export function assertHumanApproval(
  proposal: PurchaseProposal,
  input: { approved: boolean; approvalToken: string },
): void {
  if (!input.approved) {
    throw new ApprovalGateError("Human approval required (approved must be true).");
  }
  if (input.approvalToken !== proposal.approvalToken) {
    throw new ApprovalGateError("Invalid approval token.");
  }
  if (proposal.status !== "pending_approval") {
    throw new ApprovalGateError(
      `Proposal is not pending approval (status=${proposal.status}).`,
    );
  }
}

export async function executeApprovedPurchase(
  adapter: PayPalAdapter,
  proposal: PurchaseProposal,
  approval: { approved: boolean; approvalToken: string },
): Promise<PurchaseProposal> {
  assertHumanApproval(proposal, approval);

  const order = await adapter.createSandboxOrder({
    amountCents: proposal.request.amountCents,
    currency: proposal.request.currency,
    description: proposal.request.description,
  });

  return {
    ...proposal,
    status: "order_created",
    paypalOrderId: order.orderId,
  };
}
