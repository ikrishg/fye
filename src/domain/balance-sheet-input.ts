import { z } from "zod";

const assetCategory = z.enum([
  "cash",
  "investment",
  "property",
  "other_asset",
]);

const liabilityCategory = z.enum([
  "credit_card",
  "loan",
  "other_liability",
]);

export const balanceSheetEntrySchema = z.discriminatedUnion("side", [
  z.object({
    side: z.literal("asset"),
    name: z.string().trim().min(1).max(200),
    amountCents: z.number().int().nonnegative(),
    category: assetCategory,
  }),
  z.object({
    side: z.literal("liability"),
    name: z.string().trim().min(1).max(200),
    amountCents: z.number().int().nonnegative(),
    category: liabilityCategory,
  }),
]);

export type BalanceSheetEntryInput = z.infer<typeof balanceSheetEntrySchema>;
