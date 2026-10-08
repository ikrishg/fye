import type { PayPalAdapter } from "@/paypal/types";
import type { PurchaseProposal } from "@/domain/types";
import type { FyeStore } from "@/store/memory-store";
import { ProposalReserveError } from "@/store/memory-store";

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
  if (
    proposal.status !== "pending_approval" &&
    proposal.status !== "creating_order" &&
    proposal.status !== "order_created"
  ) {
    throw new ApprovalGateError(
      `Proposal is not pending approval (status=${proposal.status}).`,
    );
  }
}

export async function executeApprovedPurchase(
  store: FyeStore,
  adapter: PayPalAdapter,
  proposalId: string,
  approval: { approved: boolean; approvalToken: string },
): Promise<PurchaseProposal> {
  if (!approval.approved) {
    throw new ApprovalGateError("Human approval required (approved must be true).");
  }

  const existing = store.getProposal(proposalId);
  if (!existing) {
    throw new ApprovalGateError("Proposal not found");
  }

  if (existing.status === "order_created") {
    if (approval.approvalToken !== existing.approvalToken) {
      throw new ApprovalGateError("Invalid approval token.");
    }
    return existing;
  }

  let reserved: PurchaseProposal;
  try {
    reserved = store.reserveProposalForOrder(proposalId, approval.approvalToken);
    if (reserved.status === "order_created") {
      return reserved;
    }
  } catch (err) {
    if (err instanceof ProposalReserveError) {
      throw new ApprovalGateError(err.message);
    }
    throw err;
  }

  try {
    const order = await adapter.createSandboxOrder({
      amountCents: reserved.request.amountCents,
      currency: reserved.request.currency,
      description: reserved.request.description,
      idempotencyKey: reserved.id,
    });

    const completed: PurchaseProposal = {
      ...reserved,
      status: "order_created",
      paypalOrderId: order.orderId,
    };
    store.saveProposal(completed);
    return completed;
  } catch (err) {
    store.saveProposal({
      ...reserved,
      status: "pending_approval",
    });
    throw err;
  }
}
