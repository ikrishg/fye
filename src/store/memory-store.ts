import type {
  BalanceSheet,
  BalanceSheetLine,
  PurchaseProposal,
} from "@/domain/types";

export interface FyeStore {
  getBalanceSheet(): BalanceSheet;
  setBalanceSheet(sheet: BalanceSheet): void;
  addManualAsset(line: BalanceSheetLine): void;
  addManualLiability(line: BalanceSheetLine): void;
  addIngestLiability(line: BalanceSheetLine): void;
  replacePayPalSync(assets: BalanceSheetLine[], liabilities: BalanceSheetLine[]): void;
  getProposal(id: string): PurchaseProposal | undefined;
  saveProposal(proposal: PurchaseProposal): void;
  listProposals(): PurchaseProposal[];
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
      sheet.liabilities.push(line);
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
  };
}

let globalStore: FyeStore | null = null;

export function getStore(): FyeStore {
  if (!globalStore) {
    globalStore = createMemoryStore();
  }
  return globalStore;
}

export function resetStoreForTests(): FyeStore {
  globalStore = createMemoryStore();
  return globalStore;
}
