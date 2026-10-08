import { describe, expect, it } from "vitest";
import { mapIngestSpendToLiability } from "@/paypal/sync";
import { resetStoreForTests } from "@/store/memory-store";

describe("ingest deduplication", () => {
  it("does not double-count the same messageId", () => {
    const store = resetStoreForTests();
    const line = mapIngestSpendToLiability({
      amountCents: 48_00,
      description: "Dinner",
      messageId: "msg-123",
    });

    const first = store.addIngestLiability(line);
    const second = store.addIngestLiability(line);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.line.id).toBe(first.line.id);

    const ingestLines = store
      .getBalanceSheet()
      .liabilities.filter((l) => l.source === "imessage_ingest");
    expect(ingestLines).toHaveLength(1);
  });
});
