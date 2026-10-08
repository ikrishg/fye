# fye

Personal finance P0 loop: balance sheet, PayPal sync spine, iMessage ingest (stand-in), and a purchase agent that researches balances before creating a **PayPal sandbox** order—only after explicit human approval.

## Kill test

> If Zapier alone can hit the same PayPal Order with **no** agent research against balances, the product is dead.

This demo is intentionally **not** a Zapier → PayPal pipe. Step 4 shows the agent’s balance/net-worth research in the UI and API **before** any order is created. Approval requires a matching `approvalToken`; orders are never created hands-off.

## P0 loop (Nov 12 acceptance)

1. **Personal balance sheet** — manual assets & liabilities; net worth on dashboard (`/api/balance-sheet`).
2. **PayPal sync** — MCP `list_transactions` / `/v1/reporting/transactions` via `PayPalAdapter` → signed cash lines (`POST /api/paypal/sync`). Inflows add cash; settled outflows are cash that left (negative), never liabilities. Liabilities hold only real debts.
3. **Fye on iMessage** — ingest interface with webhook (`POST /api/ingest`) and CLI (`npm run ingest`). Real iMessage bridging is platform-specific; see [docs/IMESSAGE_BRIDGE.md](docs/IMESSAGE_BRIDGE.md).
4. **Purchase agent** — `POST /api/agent/purchase` researches against Available (liquid cash minus pending commitments); `POST /api/agent/purchase/:id/approve` creates a PayPal **sandbox** order only after human approval.

**Out of scope:** bank/card sync beyond PayPal, Bill Split REST, Agent Ready/ACP, hands-off spending.

## Auth (owner + ingest)

| Variable | Purpose |
|----------|---------|
| `FYE_API_SECRET` | Owner API key (`Authorization: Bearer …` or `fye_session` cookie) for balance sheet, PayPal sync, and purchase routes |
| `FYE_INGEST_SECRET` | Optional separate secret for `POST /api/ingest` (defaults to `FYE_API_SECRET`) |

In development, if `FYE_API_SECRET` is unset, the app uses `dev-insecure-fye-secret` and the UI auto-establishes a session. **Set `FYE_API_SECRET` in production.**

`GET /api/agent/purchase` returns proposals **without** `approvalToken`. Tokens are returned only from `POST /api/agent/purchase` (create) and must be supplied to approve.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

```bash
npm test          # balance math, sync mapping, approval gate
npm run build
```

### iMessage ingest CLI (stand-in)

```bash
npm run dev
FYE_BASE_URL=http://localhost:3000 npm run ingest -- --amount 48 --desc "Dinner receipt"
```

## PayPal adapter (mock ↔ sandbox)

Environment variables (all required to use the live sandbox adapter):

| Variable | Example |
|----------|---------|
| `PAYPAL_CLIENT_ID` | Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | Sandbox secret |
| `PAYPAL_ENV` | `sandbox` only (live is rejected in code) |

**Without credentials:** `createPayPalAdapter()` returns `MockPayPalAdapter` with fixture transactions in `src/paypal/fixtures/transactions.json`. The UI labels the adapter mode after sync.

**With credentials:** same factory returns `LivePayPalAdapter` calling OAuth2 and:

- `GET /v1/reporting/transactions` for sync
- `POST /v2/checkout/orders` for approved purchases

Never set `PAYPAL_ENV=live` for this repo; live mode throws at adapter construction.

## PayPal MCP layer

`src/mcp/paypal/` is an MCP server (`fye-paypal`, built on `@modelcontextprotocol/sdk`) whose tools mirror PayPal's `@paypal/agent-toolkit`:

| Tool | Used by | Notes |
|------|---------|-------|
| `list_transactions` | `POST /api/paypal/sync` | Toolkit params (`start_date`, `end_date`, `transaction_id`, `transaction_status`, `page`, `page_size`). |
| `create_order` | `POST /api/agent/purchase/:id/approve` | Toolkit params plus required `fye_approval: { proposal_id, approval_token }` and `idempotencyKey` (the proposal id, sent as `PayPal-Request-Id`). Refused unless the proposal was human-approved and the order total equals the approved amount. A repeat call with the same key returns the same order. The `approve` link in the response is the payment link. |

The app connects to it in-process (in-memory MCP transport). The server reads from the same `createPayPalAdapter()` factory, so it uses fixtures unless the sandbox env vars above are set. To connect an external MCP client over stdio:

```bash
npm run mcp:paypal
```

That process has its own empty proposal store, so `create_order` always refuses there; orders are only created through the app's approve step.

### Pending commitments

When approve creates an order, it's recorded once per order id as a pending commitment. It lowers **Available** (liquid cash minus pending commitments) but not cash or net worth. The approve screen shows the order's approve link; in fixture mode it points at `mock-paypal.invalid`.

A later sync settles the commitment when a `list_transactions` outflow has `paypal_reference_id` equal to the order id and the same amount. The commitment clears and the synced outflow takes the money off cash instead, so Available doesn't change on settle; net worth drops then. Pending commitments are listed with liabilities on the sheet but don't count toward the liabilities total or net worth. Re-syncing and retrying approve don't settle again or add a second commitment. In fixture mode, each mock order shows up as a fixture capture (`MOCK-CAP-<first 8 chars of proposal id>`) in the next sync, standing in for the buyer paying.

## Deploy (Vercel)

```bash
npm run build
```

Deploy as a standard Next.js app. State is in-memory (resets on cold start); swap to Vercel KV/Postgres for production persistence.

## API quick reference

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/balance-sheet` | Read / add manual lines |
| `POST /api/paypal/sync` | Pull transactions into sheet |
| `POST /api/ingest` | iMessage-style ingest |
| `POST /api/agent/purchase` | Research + pending proposal |
| `POST /api/agent/purchase/:id/approve` | Human gate → sandbox order |

## License

MIT
