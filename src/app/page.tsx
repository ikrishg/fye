"use client";

import { useCallback, useEffect, useState } from "react";
import { withLoadingFlag } from "@/lib/loading";
import { ownerFetch, signInOwner } from "@/lib/owner-fetch";

interface Totals {
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  liquidCashCents: number;
  pendingCommitmentsCents: number;
  availableCents: number;
}

interface Commitment {
  id: string;
  orderId: string;
  name: string;
  amountCents: number;
}

interface Line {
  id: string;
  name: string;
  amountCents: number;
  category: string;
  source: string;
}

interface Sheet {
  assets: Line[];
  liabilities: Line[];
}

interface Proposal {
  id: string;
  request: { description: string; amountCents: number; currency: string };
  research: {
    summary: string;
    canAfford: boolean;
    warnings: string[];
    balanceBeforeCents: number;
    netWorthBeforeCents: number;
    projectedNetWorthCents: number;
  };
  status: string;
  approvalToken: string;
  paypalOrderId?: string;
  paypalApprovalUrl?: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function isMockApprovalUrl(href: string): boolean {
  try {
    return new URL(href).hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

export default function HomePage() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [adapterLabel, setAdapterLabel] = useState<string>("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const pushLog = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 12));

  const refresh = useCallback(async () => {
    const res = await ownerFetch("/api/balance-sheet");
    if (res.status === 401) {
      setNeedsSignIn(true);
      pushLog("Owner sign-in required");
      return;
    }
    if (!res.ok) {
      pushLog(`Balance sheet load failed (${res.status})`);
      return;
    }
    setNeedsSignIn(false);
    setSignInError(null);
    const data = await res.json();
    setSheet(data.sheet);
    setTotals(data.totals);
    setCommitments(data.commitments ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addEntry(side: "asset" | "liability") {
    const name = (
      document.getElementById(`${side}-name`) as HTMLInputElement
    ).value;
    const amount = Number(
      (document.getElementById(`${side}-amount`) as HTMLInputElement).value,
    );
    const category = (
      document.getElementById(`${side}-category`) as HTMLSelectElement
    ).value;
    await withLoadingFlag(setLoading, async () => {
      const res = await ownerFetch("/api/balance-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          name,
          amountCents: Math.round(amount * 100),
          category,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        pushLog(`Add ${side} failed: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      setSheet(data.sheet);
      setTotals(data.totals);
      setCommitments(data.commitments ?? []);
      pushLog(`Added manual ${side}: ${name}`);
    });
  }

  async function syncPayPal() {
    await withLoadingFlag(setLoading, async () => {
      const res = await ownerFetch("/api/paypal/sync", { method: "POST" });
      if (!res.ok) {
        pushLog(`PayPal sync failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setSheet(data.sheet);
      setTotals(data.totals);
      setCommitments(data.commitments ?? []);
      setAdapterLabel(data.adapter);
      pushLog(`PayPal sync: ${data.syncedCount} transactions (${data.adapter})`);
      for (const c of data.settledCommitments ?? []) {
        pushLog(`Commitment settled: ${c.orderId} by ${c.settledByTransactionId}`);
      }
    });
  }

  async function ingestMessage() {
    const description = (
      document.getElementById("ingest-desc") as HTMLInputElement
    ).value;
    const amount = Number(
      (document.getElementById("ingest-amount") as HTMLInputElement).value,
    );
    await withLoadingFlag(setLoading, async () => {
      const res = await ownerFetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "receipt",
          amountCents: Math.round(amount * 100),
          currency: "USD",
          description,
          merchant: "iMessage",
          messageId: `msg-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        pushLog(`Ingest failed: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      await refresh();
      pushLog(
        data.duplicate
          ? `Ingest duplicate ignored: ${description}`
          : `iMessage ingest stand-in: ${description}`,
      );
    });
  }

  async function handleOwnerSignIn() {
    const secret = (
      document.getElementById("owner-secret") as HTMLInputElement
    ).value;
    setSignInError(null);
    const ok = await signInOwner(secret);
    if (!ok) {
      setSignInError("Invalid owner secret");
      return;
    }
    setNeedsSignIn(false);
    await refresh();
    pushLog("Owner signed in");
  }

  async function researchPurchase() {
    const description = (
      document.getElementById("purchase-desc") as HTMLInputElement
    ).value;
    const amount = Number(
      (document.getElementById("purchase-amount") as HTMLInputElement
      ).value);
    await withLoadingFlag(setLoading, async () => {
      const res = await ownerFetch("/api/agent/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amountCents: Math.round(amount * 100),
          currency: "USD",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        pushLog(`Research failed: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      setProposal(data.proposal);
      pushLog("Agent researched purchase against balances");
    });
  }

  async function approvePurchase() {
    if (!proposal) return;
    const token = proposal.approvalToken;
    await withLoadingFlag(setLoading, async () => {
      const res = await ownerFetch(`/api/agent/purchase/${proposal.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: true,
          approvalToken: token,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProposal({ ...data.proposal, approvalToken: token });
        pushLog(`PayPal sandbox order created: ${data.proposal.paypalOrderId}`);
        await refresh();
      } else {
        pushLog(`Approval blocked: ${data.error}`);
      }
    });
  }

  return (
    <main>
      <h1>fye P0 loop</h1>
      <p className="sub">
        Balance sheet → PayPal sync → iMessage ingest → agent research → human
        approval → sandbox order
      </p>

      {needsSignIn && (
        <div className="card">
          <h2>Owner sign-in</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Enter your <code>FYE_API_SECRET</code> to access balances and owner
            actions. Bridges use a separate ingest secret and never see the full
            balance sheet.
          </p>
          <label htmlFor="owner-secret">Owner API secret</label>
          <input
            id="owner-secret"
            type="password"
            autoComplete="current-password"
          />
          {signInError && <p className="warn">{signInError}</p>}
          <p style={{ marginTop: "0.75rem" }}>
            <button type="button" disabled={loading} onClick={handleOwnerSignIn}>
              Sign in
            </button>
          </p>
        </div>
      )}

      {totals && (
        <div className="card grid grid-2">
          <div>
            <div className="stat-label">Net worth</div>
            <div className="stat">{money(totals.netWorthCents)}</div>
          </div>
          <div>
            <div className="stat-label">Assets / Liabilities</div>
            <div className="stat">
              {money(totals.assetsCents)} / {money(totals.liabilitiesCents)}
            </div>
          </div>
          <div>
            <div className="stat-label">Liquid cash</div>
            <div className="stat">{money(totals.liquidCashCents)}</div>
          </div>
          <div>
            <div className="stat-label">
              Available (cash − {money(totals.pendingCommitmentsCents)} pending)
            </div>
            <div className="stat">{money(totals.availableCents)}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>1. Personal balance sheet (manual entry)</h2>
        <div className="grid grid-2">
          <div>
            <label htmlFor="asset-name">Asset name</label>
            <input id="asset-name" defaultValue="Savings" />
            <label htmlFor="asset-amount">Amount (USD)</label>
            <input id="asset-amount" type="number" step="0.01" defaultValue="1000" />
            <label htmlFor="asset-category">Category</label>
            <select id="asset-category" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="investment">Investment</option>
              <option value="property">Property</option>
              <option value="other_asset">Other</option>
            </select>
            <p style={{ marginTop: "0.75rem" }}>
              <button type="button" disabled={loading} onClick={() => addEntry("asset")}>
                Add asset
              </button>
            </p>
          </div>
          <div>
            <label htmlFor="liability-name">Liability name</label>
            <input id="liability-name" defaultValue="Personal loan" />
            <label htmlFor="liability-amount">Amount (USD)</label>
            <input id="liability-amount" type="number" step="0.01" defaultValue="200" />
            <label htmlFor="liability-category">Category</label>
            <select id="liability-category" defaultValue="loan">
              <option value="credit_card">Credit card</option>
              <option value="loan">Loan</option>
              <option value="other_liability">Other</option>
            </select>
            <p style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => addEntry("liability")}
              >
                Add liability
              </button>
            </p>
          </div>
        </div>
        {sheet && (
          <table style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Side</th>
                <th>Source</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {sheet.assets.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>Asset</td>
                  <td><span className="tag">{l.source}</span></td>
                  <td>{money(l.amountCents)}</td>
                </tr>
              ))}
              {sheet.liabilities.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td>Liability</td>
                  <td><span className="tag">{l.source}</span></td>
                  <td>{money(l.amountCents)}</td>
                </tr>
              ))}
              {commitments.map((c) => (
                <tr key={c.id}>
                  <td>Pending: {c.name} ({c.orderId})</td>
                  <td>Commitment</td>
                  <td><span className="tag">pending_commitment</span></td>
                  <td>{money(c.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>2. PayPal transaction sync</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Uses the PayPal MCP <code>list_transactions</code> tool /{" "}
          <code>/v1/reporting/transactions</code>.{" "}
          {adapterLabel || "Mock fixtures until sandbox creds are set."}
        </p>
        <button type="button" disabled={loading} onClick={syncPayPal}>
          Sync last 30 days
        </button>
      </div>

      <div className="card">
        <h2>3. Fye on iMessage (ingest stand-in)</h2>
        <label htmlFor="ingest-desc">Receipt / transaction text</label>
        <input id="ingest-desc" defaultValue="Dinner with friends $48" />
        <label htmlFor="ingest-amount">Amount (USD)</label>
        <input id="ingest-amount" type="number" step="0.01" defaultValue="48" />
        <p style={{ marginTop: "0.75rem" }}>
          <button type="button" disabled={loading} onClick={ingestMessage}>
            POST /api/ingest (webhook stand-in)
          </button>
        </p>
      </div>

      <div className="card">
        <h2>4. Purchase agent + approval gate</h2>
        <label htmlFor="purchase-desc">What do you want to buy?</label>
        <input id="purchase-desc" defaultValue="New headphones" />
        <label htmlFor="purchase-amount">Amount (USD)</label>
        <input id="purchase-amount" type="number" step="0.01" defaultValue="299" />
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" disabled={loading} onClick={researchPurchase}>
            Research against balances
          </button>
          <button
            type="button"
            className="secondary"
            disabled={loading || !proposal || proposal.status !== "pending_approval"}
            onClick={approvePurchase}
          >
            Approve &amp; create PayPal sandbox order
          </button>
        </div>
        {proposal && (
          <div style={{ marginTop: "1rem" }}>
            <p className={proposal.research.canAfford ? "ok" : "warn"}>
              {proposal.research.canAfford ? "Can afford" : "Caution"} — status:{" "}
              {proposal.status}
              {proposal.paypalOrderId ? ` · order ${proposal.paypalOrderId}` : ""}
            </p>
            {proposal.paypalApprovalUrl && (
              <p id="approve-link">
                Approve link (payment link):{" "}
                <a href={proposal.paypalApprovalUrl} target="_blank" rel="noreferrer">
                  {proposal.paypalApprovalUrl}
                </a>
                {isMockApprovalUrl(proposal.paypalApprovalUrl) &&
                  " (fixture mock link, not a real PayPal page)"}
              </p>
            )}
            {proposal.research.warnings.map((w) => (
              <p key={w} className="warn">{w}</p>
            ))}
            <div className="research">{proposal.research.summary}</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Demo log</h2>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--muted)" }}>
          {log.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
