import fs from "node:fs";
import path from "node:path";
import type { BalanceSheet, BalanceSheetLine, PurchaseProposal } from "@/domain/types";
import { createMemoryStore, type FyeStore } from "@/store/memory-store";

interface Snapshot {
  version: 1;
  sheet: BalanceSheet;
  proposals: PurchaseProposal[];
}

type Writer = (filePath: string, snapshot: Snapshot) => void;

const MUTATORS = [
  "setBalanceSheet",
  "addManualAsset",
  "addManualLiability",
  "addIngestLiability",
  "replacePayPalSync",
  "saveProposal",
  "reserveProposalForOrder",
] as const satisfies readonly (keyof FyeStore)[];

const STATUSES = new Set(["pending_approval", "creating_order", "approved", "rejected", "order_created"]);

/**
 * Durable FyeStore for a single long-running server: the memory store, loaded from
 * a JSON file on start and written back atomically after every mutation. If a write
 * fails, the in-memory state rolls back to the last saved snapshot, so memory never
 * gets ahead of disk. It stands in until a real database is chosen and does not suit
 * serverless hosts, where the filesystem is not shared or kept.
 */
export function createFileStore(filePath: string, writer: Writer = write): FyeStore {
  let saved: Snapshot = load(filePath) ?? snapshotOf(createMemoryStore());
  let inner = fromSnapshot(saved);

  const store: Record<string, unknown> = {};
  for (const name of Object.keys(inner) as (keyof FyeStore)[]) {
    store[name] = (...args: unknown[]) =>
      (inner[name] as (...a: unknown[]) => unknown)(...args);
  }
  for (const name of MUTATORS) {
    store[name] = (...args: unknown[]) => {
      const result = (inner[name] as (...a: unknown[]) => unknown)(...args);
      const next = snapshotOf(inner);
      try {
        writer(filePath, next);
      } catch (err) {
        inner = fromSnapshot(saved);
        throw err;
      }
      saved = next;
      return result;
    };
  }
  return store as unknown as FyeStore;
}

function snapshotOf(store: FyeStore): Snapshot {
  return { version: 1, sheet: store.getBalanceSheet(), proposals: store.listProposals() };
}

function fromSnapshot(snapshot: Snapshot): FyeStore {
  const store = createMemoryStore();
  store.setBalanceSheet(structuredClone(snapshot.sheet));
  for (const p of snapshot.proposals) store.saveProposal(structuredClone(p));
  return store;
}

function load(filePath: string): Snapshot | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const bad = (why: string) => new Error(`Unrecognised fye data file at ${filePath}: ${why}`);
  let data: Snapshot;
  try {
    data = JSON.parse(raw) as Snapshot;
  } catch {
    throw bad("not valid JSON");
  }
  if (data?.version !== 1 || !data.sheet || !Array.isArray(data.proposals)) throw bad("wrong shape");
  for (const list of [data.sheet.assets, data.sheet.liabilities]) {
    if (!Array.isArray(list)) throw bad("sheet lines missing");
    for (const line of list) if (!isLine(line)) throw bad(`bad line ${JSON.stringify(line)}`);
  }
  for (const p of data.proposals) if (!isProposal(p)) throw bad(`bad proposal ${JSON.stringify(p?.id)}`);

  // A reservation saved before a crash has no request left to finish it. Put it back to
  // pending so approval can be retried; the retry reuses the proposal id as the PayPal
  // idempotency key, so PayPal returns the earlier order instead of creating a second one.
  data.proposals = data.proposals.map((p) =>
    p.status === "creating_order" ? { ...p, status: "pending_approval" } : p,
  );
  return data;
}

function isLine(l: BalanceSheetLine): boolean {
  return (
    !!l &&
    typeof l.id === "string" &&
    typeof l.name === "string" &&
    Number.isSafeInteger(l.amountCents) &&
    typeof l.category === "string" &&
    typeof l.source === "string" &&
    typeof l.updatedAt === "string"
  );
}

function isProposal(p: PurchaseProposal): boolean {
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.approvalToken === "string" &&
    STATUSES.has(p.status) &&
    !!p.request &&
    Number.isSafeInteger(p.request.amountCents) &&
    typeof p.request.currency === "string" &&
    !!p.research &&
    typeof p.createdAt === "string"
  );
}

function write(filePath: string, snapshot: Snapshot): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}
