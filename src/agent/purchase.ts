import type { PayPalMcpClient } from "@/mcp/paypal/client";
import type { CreateOrderArgs } from "@/mcp/paypal/tools";
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

export function orderArgsForProposal(proposal: PurchaseProposal): CreateOrderArgs {
  const value = proposal.request.amountCents / 100;
  return {
    currencyCode: proposal.request.currency as CreateOrderArgs["currencyCode"],
    items: [
      {
        name: proposal.request.description,
        quantity: 1,
        itemCost: value,
        taxPercent: 0,
        itemTotal: value,
      },
    ],
    notes: proposal.request.description,
    fye_approval: {
      proposal_id: proposal.id,
      approval_token: proposal.approvalToken,
    },
  };
}

/**
 * Reserves the proposal (the human approval), then asks the PayPal MCP server
 * to create the order. The MCP `create_order` tool re-checks the reservation.
 */
export async function executeApprovedPurchase(
  paypal: PayPalMcpClient,
  store: FyeStore,
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
    await paypal.createOrder(orderArgsForProposal(reserved));
  } catch (err) {
    store.saveProposal({ ...reserved, status: "pending_approval" });
    throw err;
  }

  const completed = store.getProposal(proposalId);
  if (!completed) {
    throw new Error(`Proposal ${proposalId} disappeared after create_order.`);
  }
  return completed;
}
