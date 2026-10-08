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
