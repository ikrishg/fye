import fs from "node:fs";
import path from "node:path";
import type { BalanceSheet, PurchaseProposal } from "@/domain/types";
import { createMemoryStore, type FyeStore } from "@/store/memory-store";

interface Snapshot {
  version: 1;
  sheet: BalanceSheet;
  proposals: PurchaseProposal[];
}

const MUTATORS = [
  "setBalanceSheet",
  "addManualAsset",
  "addManualLiability",
  "addIngestLiability",
  "replacePayPalSync",
  "saveProposal",
  "reserveProposalForOrder",
] as const satisfies readonly (keyof FyeStore)[];

/**
 * Durable FyeStore for a single long-running server: the memory store, loaded from
 * a JSON file on start and written back atomically after every mutation. It is a
 * stand-in until a real database is chosen; it does not suit serverless hosts,
 * where the filesystem is not shared or kept.
 */
export function createFileStore(filePath: string): FyeStore {
  const store = createMemoryStore();
  const snapshot = load(filePath);
  if (snapshot) {
    store.setBalanceSheet(snapshot.sheet);
    for (const p of snapshot.proposals) store.saveProposal(p);
  }

  const persist = () =>
    write(filePath, { version: 1, sheet: store.getBalanceSheet(), proposals: store.listProposals() });

  const wrapped = { ...store };
  for (const name of MUTATORS) {
    const original = store[name] as (...args: unknown[]) => unknown;
    (wrapped as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const result = original(...args);
      persist();
      return result;
    };
  }
  return wrapped;
}

function load(filePath: string): Snapshot | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const data = JSON.parse(raw) as Snapshot;
  if (data.version !== 1 || !data.sheet || !Array.isArray(data.proposals)) {
    throw new Error(`Unrecognised fye data file at ${filePath}`);
  }
  return data;
}

function write(filePath: string, snapshot: Snapshot): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}
