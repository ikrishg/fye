import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { ZodError } from "zod";
import {
  createManualAsset,
  createManualLiability,
  netWorthCents,
  sumAssets,
  sumLiabilities,
} from "@/domain/balance-sheet";
import { balanceSheetEntrySchema } from "@/domain/balance-sheet-input";
import { AuthError } from "@/lib/auth";
import { assertOwnerAuth } from "@/lib/auth-server";
import type { BalanceSheet } from "@/domain/types";
import { getStore } from "@/store/memory-store";

export const runtime = "nodejs";

function totalsPayload(sheet: BalanceSheet) {
  return {
    sheet,
    totals: {
      assetsCents: sumAssets(sheet),
      liabilitiesCents: sumLiabilities(sheet),
      netWorthCents: netWorthCents(sheet),
    },
  };
}

export async function GET(request: Request) {
  try {
    await assertOwnerAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const store = getStore();
  return NextResponse.json(totalsPayload(store.getBalanceSheet()));
}

export async function POST(request: Request) {
  try {
    await assertOwnerAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  try {
    const body = balanceSheetEntrySchema.parse(await request.json());
    const store = getStore();
    const id = uuidv4();

    if (body.side === "asset") {
      const line = createManualAsset({
        id,
        name: body.name,
        amountCents: body.amountCents,
        category: body.category,
      });
      store.addManualAsset(line);
    } else {
      const line = createManualLiability({
        id,
        name: body.name,
        amountCents: body.amountCents,
        category: body.category,
      });
      store.addManualLiability(line);
    }

    return NextResponse.json(totalsPayload(store.getBalanceSheet()));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid balance sheet entry", details: err.flatten() },
        { status: 400 },
      );
    }
    throw err;
  }
}
