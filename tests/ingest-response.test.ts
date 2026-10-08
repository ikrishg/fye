import { describe, expect, it } from "vitest";
import { buildIngestApiResponse } from "@/ingest/response";

describe("ingest API response", () => {
  it("does not expose balance sheet or totals", () => {
    const body = buildIngestApiResponse({
      duplicate: false,
      line: {
        id: "ingest-msg-1",
        name: "receipt: Dinner",
        amountCents: 4800,
        category: "other_liability",
        source: "imessage_ingest",
        externalId: "msg-1",
        updatedAt: new Date().toISOString(),
      },
    });

    expect(body).not.toHaveProperty("sheet");
    expect(body).not.toHaveProperty("totals");
    expect(body.ingested.amountCents).toBe(4800);
    expect(body.duplicate).toBe(false);
  });
});
