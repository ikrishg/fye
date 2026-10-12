import type {
  BalanceSheet,
  BalanceSheetLine,
  PurchaseProposal,
} from "@/domain/types";
// file-store imports createMemoryStore back; both are only called at runtime, so the cycle is safe.
import { createFileStore } from "@/store/file-store";

export class ProposalReserveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalReserveError";
  }
}

export interface IngestResult {
  line: BalanceSheetLine;
  duplicate: boolean;
}

export interface FyeStore {
  getBalanceSheet(): BalanceSheet;
  setBalanceSheet(sheet: BalanceSheet): void;
  addManualAsset(line: BalanceSheetLine): void;
  addManualLiability(line: BalanceSheetLine): void;
  addIngestLiability(line: BalanceSheetLine): IngestResult;
  replacePayPalSync(assets: BalanceSheetLine[], liabilities: BalanceSheetLine[]): void;
  getProposal(id: string): PurchaseProposal | undefined;
  saveProposal(proposal: PurchaseProposal): void;
  listProposals(): PurchaseProposal[];
  reserveProposalForOrder(
    id: string,
    approvalToken: string,
  ): PurchaseProposal;
}

const defaultSheet: BalanceSheet = {
  assets: [
    {
      id: "seed-checking",
      name: "Checking account",
      amountCents: 250_000,
      category: "cash",
      source: "manual",
      updatedAt: new Date().toISOString(),
    },
  ],
  liabilities: [
    {
      id: "seed-cc",
      name: "Credit card balance",
      amountCents: 45_000,
      category: "credit_card",
      source: "manual",
      updatedAt: new Date().toISOString(),
    },
  ],
};

function cloneSheet(sheet: BalanceSheet): BalanceSheet {
  return {
    assets: [...sheet.assets],
    liabilities: [...sheet.liabilities],
  };
}

function findIngestByExternalId(
  sheet: BalanceSheet,
  externalId: string,
): BalanceSheetLine | undefined {
  return sheet.liabilities.find(
    (l) => l.source === "imessage_ingest" && l.externalId === externalId,
  );
}

export function createMemoryStore(): FyeStore {
  let sheet = cloneSheet(defaultSheet);
  const proposals = new Map<string, PurchaseProposal>();

  return {
    getBalanceSheet: () => cloneSheet(sheet),
    setBalanceSheet: (next) => {
      sheet = cloneSheet(next);
    },
    addManualAsset(line) {
      sheet.assets.push(line);
    },
    addManualLiability(line) {
      sheet.liabilities.push(line);
    },
    addIngestLiability(line) {
      if (line.externalId) {
        const existing = findIngestByExternalId(sheet, line.externalId);
        if (existing) {
          return { line: existing, duplicate: true };
        }
      }
      sheet.liabilities.push(line);
      return { line, duplicate: false };
    },
    replacePayPalSync(assets, liabilities) {
      sheet = {
        assets,
        liabilities,
      };
    },
    getProposal(id) {
      return proposals.get(id);
    },
    saveProposal(proposal) {
      proposals.set(proposal.id, proposal);
    },
    listProposals() {
      return [...proposals.values()].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt),
      );
    },
    reserveProposalForOrder(id, approvalToken) {
      const proposal = proposals.get(id);
      if (!proposal) {
        throw new ProposalReserveError("Proposal not found");
      }
      if (proposal.approvalToken !== approvalToken) {
        throw new ProposalReserveError("Invalid approval token");
      }
      if (proposal.status === "order_created") {
        return proposal;
      }
      if (proposal.status === "creating_order") {
        throw new ProposalReserveError("Order creation already in progress");
      }
      if (proposal.status !== "pending_approval") {
        throw new ProposalReserveError(
          `Proposal is not pending approval (status=${proposal.status})`,
        );
      }
      const reserved: PurchaseProposal = {
        ...proposal,
        status: "creating_order",
      };
      proposals.set(id, reserved);
      return reserved;
    },
  };
}

let globalStore: FyeStore | null = null;

/**
 * FYE_DATA_FILE set: state persists to that JSON file (see file-store.ts).
 * Unset: in-memory, lost on restart.
 */
export function getStore(): FyeStore {
  if (!globalStore) {
    const file = process.env.FYE_DATA_FILE;
    if (file) {
      globalStore = createFileStore(file);
    } else {
      globalStore = createMemoryStore();
    }
  }
  return globalStore;
}

export function resetStoreForTests(): FyeStore {
  globalStore = createMemoryStore();
  return globalStore;
}
