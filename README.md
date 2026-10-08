# fye

Personal finance P0 loop: balance sheet, PayPal sync spine, iMessage ingest (stand-in), and a purchase agent that researches balances before creating a **PayPal sandbox** order—only after explicit human approval.

## Kill test

> If Zapier alone can hit the same PayPal Order with **no** agent research against balances, the product is dead.

This demo is intentionally **not** a Zapier → PayPal pipe. Step 4 shows the agent’s balance/net-worth research in the UI and API **before** any order is created. Approval requires a matching `approvalToken`; orders are never created hands-off.

## P0 loop (Nov 12 acceptance)

1. **Personal balance sheet** — manual assets & liabilities; net worth on dashboard (`/api/balance-sheet`).
2. **PayPal sync** — `list_transaction` / `/v1/reporting/transactions` via `PayPalAdapter` → balance sheet lines (`POST /api/paypal/sync`).
3. **Fye on iMessage** — ingest interface with webhook (`POST /api/ingest`) and CLI (`npm run ingest`). Real iMessage bridging is platform-specific; see [docs/IMESSAGE_BRIDGE.md](docs/IMESSAGE_BRIDGE.md).
4. **Purchase agent** — `POST /api/agent/purchase` researches against current balances; `POST /api/agent/purchase/:id/approve` creates a PayPal **sandbox** order only after human approval.

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
| `create_order` | `POST /api/agent/purchase/:id/approve` | Toolkit params plus required `fye_approval: { proposal_id, approval_token }`. Refused unless the proposal was human-approved and the order total equals the approved amount. The `approve` link in the response is the payment link. |

The app connects to it in-process (in-memory MCP transport). The server reads from the same `createPayPalAdapter()` factory, so it uses fixtures unless the sandbox env vars above are set. To connect an external MCP client over stdio:

```bash
npm run mcp:paypal
```

That process has its own empty proposal store, so `create_order` always refuses there; orders are only created through the app's approve step.

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
