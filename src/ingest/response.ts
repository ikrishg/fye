import type { IngestResult } from "@/store/memory-store";

/** Minimal ingest API payload — no balance sheet or net-worth leakage. */
export function buildIngestApiResponse(result: IngestResult) {
  return {
    ingested: {
      id: result.line.id,
      name: result.line.name,
      amountCents: result.line.amountCents,
      externalId: result.line.externalId,
      source: result.line.source,
    },
    duplicate: result.duplicate,
  };
}
