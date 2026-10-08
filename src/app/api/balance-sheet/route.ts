import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  createManualAsset,
  createManualLiability,
  netWorthCents,
  sumAssets,
  sumLiabilities,
} from "@/domain/balance-sheet";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

export async function GET() {
  const store = getStore();
  const sheet = store.getBalanceSheet();
  return NextResponse.json({
    sheet,
    totals: {
      assetsCents: sumAssets(sheet),
      liabilitiesCents: sumLiabilities(sheet),
      netWorthCents: netWorthCents(sheet),
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    side: "asset" | "liability";
    name: string;
    amountCents: number;
    category: string;
  };

  const store = getStore();
  const id = uuidv4();

  if (body.side === "asset") {
    const line = createManualAsset({
      id,
      name: body.name,
      amountCents: body.amountCents,
      category: body.category as "cash" | "investment" | "property" | "other_asset",
    });
    store.addManualAsset(line);
  } else {
    const line = createManualLiability({
      id,
      name: body.name,
      amountCents: body.amountCents,
      category: body.category as "credit_card" | "loan" | "other_liability",
    });
    store.addManualLiability(line);
  }

  const sheet = store.getBalanceSheet();
  return NextResponse.json({
    sheet,
    totals: {
      assetsCents: sumAssets(sheet),
      liabilitiesCents: sumLiabilities(sheet),
      netWorthCents: netWorthCents(sheet),
    },
  });
}
