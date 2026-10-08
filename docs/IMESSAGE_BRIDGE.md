# iMessage bridge options (P0 stand-in)

fye P0 does **not** ship a native iMessage extension. Ingest is defined by `POST /api/ingest` and the `npm run ingest` CLI so any bridge can forward messages into the same contract.

## Ingest contract

```json
{
  "kind": "transaction" | "receipt",
  "amountCents": 4800,
  "currency": "USD",
  "description": "Dinner with friends",
  "merchant": "optional",
  "rawText": "optional original message body",
  "messageId": "optional stable id for dedupe"
}
```

## Bridge options (platform-specific)

| Approach | Platform | Notes |
|----------|----------|--------|
| **Shortcuts automation** | iOS / macOS | User shares receipt screenshot or text → Shortcut parses amount → HTTP POST to `https://your-fye.app/api/ingest`. No App Store review; user-owned. |
| **BlueBubbles / AirMessage server** | macOS host + clients | Self-hosted relay exposes webhooks when new messages arrive; filter senders/keywords and forward to `/api/ingest`. |
| **Beeper / Matrix bridge** | Cross-platform | Message events on a bridge room → small worker maps text to ingest payload. |
| **macOS Messages DB + launchd** | Mac only | Read `chat.db` (with Full Disk Access) via a local agent; fragile across OS updates—not recommended for production. |
| **SMS fallback** | Twilio/etc. | Forward “text receipts” to a number that hits ingest; not iMessage but similar UX. |

## Security

- Authenticate webhooks (shared secret header, signed payloads).
- Treat `rawText` as untrusted input; validate with the same Zod schema as the API.
- Never auto-create PayPal orders from ingest—only the approval-gated agent path may create orders.

## P0 implementation in this repo

- **Webhook:** `src/app/api/ingest/route.ts`
- **CLI:** `scripts/ingest-cli.ts`
- **Mapping:** spend lines append to liabilities with `source: imessage_ingest`
