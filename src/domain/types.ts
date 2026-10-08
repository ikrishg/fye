export type AssetCategory =
  | "cash"
  | "investment"
  | "property"
  | "other_asset";

export type LiabilityCategory =
  | "credit_card"
  | "loan"
  | "other_liability";

export interface BalanceSheetLine {
  id: string;
  name: string;
  amountCents: number;
  category: AssetCategory | LiabilityCategory;
  source: "manual" | "paypal_sync" | "imessage_ingest";
  externalId?: string;
  /** PayPal `paypal_reference_id` (the order id for an order capture). */
  orderReference?: string;
  updatedAt: string;
}

/**
 * Money promised to an approved PayPal order that hasn't been captured yet.
 * It reduces available balance, not cash or net worth, until a synced
 * capture for the same order settles it.
 */
export interface PendingCommitment {
  id: string;
  proposalId: string;
  orderId: string;
  name: string;
  amountCents: number;
  currency: string;
  status: "pending" | "settled";
  createdAt: string;
  settledAt?: string;
  settledByTransactionId?: string;
}

export interface BalanceSheet {
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
}

export interface PayPalTransaction {
  transaction_id: string;
  transaction_status: string;
  transaction_amount: {
    currency_code: string;
    value: string;
  };
  transaction_info?: {
    transaction_subject?: string;
    paypal_reference_id?: string;
  };
  payer_info?: {
    email_address?: string;
  };
  transaction_event_code?: string;
}

export interface IngestPayload {
  kind: "transaction" | "receipt";
  amountCents: number;
  currency: string;
  description: string;
  merchant?: string;
  rawText?: string;
  messageId?: string;
}

export interface PurchaseResearchRequest {
  description: string;
  amountCents: number;
  currency: string;
}

export type PurchaseProposalStatus =
  | "pending_approval"
  | "creating_order"
  | "approved"
  | "rejected"
  | "order_created";

export interface PurchaseProposal {
  id: string;
  request: PurchaseResearchRequest;
  research: {
    summary: string;
    balanceBeforeCents: number;
    netWorthBeforeCents: number;
    projectedNetWorthCents: number;
    canAfford: boolean;
    warnings: string[];
  };
  status: PurchaseProposalStatus;
  paypalOrderId?: string;
  /** create_order's `approve` link: the payment link for this order. */
  paypalApprovalUrl?: string;
  approvalToken: string;
  createdAt: string;
}
