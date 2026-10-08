import { z } from "zod";
import type { IngestPayload } from "@/domain/types";
import { mapIngestSpendToLiability } from "@/paypal/sync";

export const ingestPayloadSchema = z.object({
  kind: z.enum(["transaction", "receipt"]),
  amountCents: z.number().int().positive(),
  currency: z.string().min(3).max(3),
  description: z.string().min(1),
  merchant: z.string().optional(),
  rawText: z.string().optional(),
  messageId: z.string().optional(),
});

export function parseIngestBody(body: unknown): IngestPayload {
  return ingestPayloadSchema.parse(body);
}

export function ingestToBalanceLine(payload: IngestPayload) {
  const label = payload.merchant
    ? `${payload.kind}: ${payload.merchant} — ${payload.description}`
    : `${payload.kind}: ${payload.description}`;

  return mapIngestSpendToLiability({
    amountCents: payload.amountCents,
    description: label,
    messageId: payload.messageId,
  });
}
