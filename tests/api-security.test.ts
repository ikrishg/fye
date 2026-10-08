import { describe, expect, it } from "vitest";
import { createPurchaseProposal } from "@/agent/research";
import { toPublicProposal } from "@/lib/proposal-view";
import { resetStoreForTests } from "@/store/memory-store";

describe("API security helpers", () => {
  it("strips approval tokens from public proposal listings", () => {
    const store = resetStoreForTests();
    const proposal = createPurchaseProposal(store.getBalanceSheet(), {
      description: "Test",
      amountCents: 10_00,
      currency: "USD",
    });
    store.saveProposal(proposal);

    const listed = store.listProposals().map(toPublicProposal);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("approvalToken");
    expect(store.getProposal(proposal.id)?.approvalToken).toBe(
      proposal.approvalToken,
    );
  });
});
