import type { PurchaseProposal } from "@/domain/types";

export type PublicPurchaseProposal = Omit<PurchaseProposal, "approvalToken">;

export function toPublicProposal(
  proposal: PurchaseProposal,
): PublicPurchaseProposal {
  const { approvalToken: _token, ...publicFields } = proposal;
  return publicFields;
}
