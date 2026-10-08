import type { BalanceSheet, BalanceSheetLine, LiabilityCategory } from "./types";

const LIABILITY_CATEGORIES: LiabilityCategory[] = [
  "credit_card",
  "loan",
  "other_liability",
];

export function isLiabilityCategory(
  category: BalanceSheetLine["category"],
): boolean {
  return (LIABILITY_CATEGORIES as string[]).includes(category);
}

export function sumAssets(sheet: BalanceSheet): number {
  return sheet.assets.reduce((sum, line) => sum + line.amountCents, 0);
}

export function sumLiabilities(sheet: BalanceSheet): number {
  return sheet.liabilities.reduce((sum, line) => sum + line.amountCents, 0);
}

export function netWorthCents(sheet: BalanceSheet): number {
  return sumAssets(sheet) - sumLiabilities(sheet);
}

export function createManualAsset(input: {
  id: string;
  name: string;
  amountCents: number;
  category: BalanceSheetLine["category"];
}): BalanceSheetLine {
  if (isLiabilityCategory(input.category)) {
    throw new Error("Use createManualLiability for liability categories");
  }
  return {
    id: input.id,
    name: input.name,
    amountCents: input.amountCents,
    category: input.category,
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}

export function createManualLiability(input: {
  id: string;
  name: string;
  amountCents: number;
  category: LiabilityCategory;
}): BalanceSheetLine {
  return {
    id: input.id,
    name: input.name,
    amountCents: input.amountCents,
    category: input.category,
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}
