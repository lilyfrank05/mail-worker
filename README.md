# mail-worker

Cloudflare Worker that sends emails via an API-key-authenticated HTTP endpoint. Uses the Cloudflare [Email Service](https://developers.cloudflare.com/email-service/) `send_email` binding — no SMTP servers, no third-party email providers.

## Features

- `POST /send-email` endpoint with `Bearer` API-key authentication
- Sender address configurable at runtime via the `FROM_ADDRESS` secret (never accepted from requests — prevents spoofing)
- Plain-text emails with optional CC
- Input validation: email format, subject/body length limits, 1 MiB request cap
- Cloudflare Email Service error codes mapped to proper HTTP statuses

## Architecture

```
Request → Worker → validate API key → validate body → env.EMAIL.send() → response
```

## Prerequisites

1. **Cloudflare account** with Workers enabled.
2. **Sender domain onboarded to Cloudflare Email Service** and verified (DKIM/SPF records). Emails are sent `from` your verified domain; Cloudflare rejects unverified senders (`E_SENDER_NOT_VERIFIED`).
3. **Node.js 18+** (local development only).

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then edit with your values
npm run dev                      # starts wrangler dev on http://localhost:8787
```

`.dev.vars` is gitignored — secrets never reach the repository.

## Deploying

### Option A — GitHub Actions (recommended)

Push to GitHub, then:

1. Create a Cloudflare API token: dashboard → My Profile → API Tokens → **Create Token** → "Edit Cloudflare Workers" template.
2. In the GitHub repo: **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN` — the token from step 1
   - `EMAIL_WORKER_API_KEY` — the key clients must send in the `Authorization` header (generate your own, e.g. `openssl rand -hex 32`)
   - `FROM_ADDRESS` — the verified sender address, e.g. `noreply@yourdomain.com`
3. Push to `main`. The [workflow](.github/workflows/deploy.yml) runs `npm ci`, uploads the Worker, and writes both secrets via `wrangler secret put`.

If your API token is not scoped to exactly one account, add your account ID to `wrangler.toml` (see the placeholder there) or as a `CLOUDFLARE_ACCOUNT_ID` secret.

### Option B — Manual

```bash
npx wrangler login
npm run deploy                          # → mail-worker.<subdomain>.workers.dev
npx wrangler secret put EMAIL_WORKER_API_KEY
npx wrangler secret put FROM_ADDRESS
```

## API

### `POST /send-email`

**Authentication:** `Authorization: Bearer <EMAIL_WORKER_API_KEY>`

**Request body** (JSON):

```jsonc
{
  "to": "alice@example.com",           // required
  "cc": "bob@example.com",             // optional
  "subject": "Your Report is Ready",   // required, max 998 chars
  "text": "Your report is ready."      // required, max 1 MiB
}
```

**Responses:**

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{"success": true, "messageId": "<id>"}` | Sent |
| 400 | `{"success": false, "error": "..."}` | Validation failure or email service rejected (unverified sender, suppressed recipient) |
| 401 | `{"success": false, "error": "Unauthorized"}` | Missing or invalid API key |
| 404 | — | Path is not `/send-email` |
| 405 | — | Method is not `POST` |
| 413 | — | Request body exceeds 1 MiB |
| 429 | `{"success": false, "error": "Rate limit exceeded"}` | Cloudflare rate/daily limit hit |
| 500 | `{"success": false, "error": "..."}` | Internal error or misconfigured secrets |

### Example

```bash
curl -X POST https://mail-worker.<subdomain>.workers.dev/send-email \
  -H "Authorization: Bearer <EMAIL_WORKER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "alice@example.com",
    "cc": "bob@example.com",
    "subject": "Hello",
    "text": "Hello from mail-worker!"
  }'
```

## Security notes

- **API key** is validated with constant-time comparison and stored as a Workers Secret; revoke by rotating the secret.
- **Sender is fixed** — `FROM_ADDRESS` is server-side only, so clients cannot spoof the From header.
- **Input limits** prevent abuse: address format/length checks, 998-char subject, 1 MiB body/request cap.
- Cloudflare's suppression list and per-account rate limits apply automatically.

## Project layout

```
mail-worker/
├── .github/workflows/deploy.yml   # GitHub Actions deploy
├── wrangler.toml                  # Worker config + send_email binding
├── src/
│   ├── index.ts                   # fetch handler, error mapping
│   ├── auth.ts                    # Bearer key validation
│   ├── validate.ts                # request body validation
│   └── types.ts                   # Env / request types
└── .dev.vars.example              # local dev secret template
```
