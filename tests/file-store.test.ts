import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileStore } from "@/store/file-store";

const dirs: string[] = [];
function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fye-store-"));
  dirs.push(dir);
  return path.join(dir, "nested", "fye.json");
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("file store", () => {
  it("starts from the seed sheet when no file exists", () => {
    const store = createFileStore(tmpFile());
    expect(store.getBalanceSheet().assets.length).toBeGreaterThan(0);
  });

  it("keeps balance sheet changes across a restart", () => {
    const file = tmpFile();
    const first = createFileStore(file);
    first.addManualAsset({
      id: "brokerage",
      name: "Brokerage",
      amountCents: 1_000_00,
      category: "investment",
      source: "manual",
      updatedAt: "2026-10-12T00:00:00.000Z",
    });
    const second = createFileStore(file);
    expect(second.getBalanceSheet().assets.map((a) => a.id)).toContain("brokerage");
  });

  it("rejects a file it does not recognise", () => {
    const file = tmpFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 9 }));
    expect(() => createFileStore(file)).toThrow(/Unrecognised/);
  });
});

const proposal = (over: Partial<import("@/domain/types").PurchaseProposal> = {}) => ({
  id: "prop-1",
  request: { description: "Headphones", amountCents: 12_000, currency: "USD" },
  research: {
    summary: "ok",
    balanceBeforeCents: 250_000,
    netWorthBeforeCents: 205_000,
    projectedNetWorthCents: 193_000,
    canAfford: true,
    warnings: [],
  },
  status: "pending_approval" as const,
  approvalToken: "tok-1",
  createdAt: "2026-10-12T00:00:00.000Z",
  ...over,
});

describe("file store proposals", () => {
  it("round-trips a created order with its token, request and PayPal id", () => {
    const file = tmpFile();
    createFileStore(file).saveProposal(proposal({ status: "order_created", paypalOrderId: "ORDER-9" }));
    const back = createFileStore(file).getProposal("prop-1");
    expect(back).toMatchObject({
      approvalToken: "tok-1",
      status: "order_created",
      paypalOrderId: "ORDER-9",
      request: { amountCents: 12_000 },
    });
  });

  it("puts a reservation interrupted by a restart back to pending", () => {
    const file = tmpFile();
    const first = createFileStore(file);
    first.saveProposal(proposal());
    first.reserveProposalForOrder("prop-1", "tok-1");
    expect(first.getProposal("prop-1")?.status).toBe("creating_order");
    const second = createFileStore(file);
    expect(second.getProposal("prop-1")?.status).toBe("pending_approval");
    expect(second.reserveProposalForOrder("prop-1", "tok-1").status).toBe("creating_order");
  });

  it("rolls memory back when a save fails", () => {
    const file = tmpFile();
    let fail = false;
    const store = createFileStore(file, (f, s) => {
      if (fail) throw new Error("disk full");
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(s));
    });
    store.saveProposal(proposal());
    fail = true;
    expect(() => store.reserveProposalForOrder("prop-1", "tok-1")).toThrow(/disk full/);
    expect(store.getProposal("prop-1")?.status).toBe("pending_approval");
  });

  it("rejects saved lines with a bad amount", () => {
    const file = tmpFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        sheet: { assets: [{ id: "a", name: "A", amountCents: "10", category: "cash", source: "manual", updatedAt: "t" }], liabilities: [] },
        proposals: [],
      }),
    );
    expect(() => createFileStore(file)).toThrow(/bad line/);
  });
});
