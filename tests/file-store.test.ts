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
