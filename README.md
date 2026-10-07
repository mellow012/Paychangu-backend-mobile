# Escrow P2P — PayChangu backend

A small Next.js API that lets the Android app take real fiat payments via
PayChangu, without putting any secret keys inside the app itself.

## What it does

- `POST /api/paychangu/initiate` — Android calls this when the buyer taps
  "Lock Funds". Reads the trade's amount from Firestore (never trusts the
  client's number), opens a PayChangu Standard Checkout session, returns a
  `checkoutUrl` for the app to open in a browser/Custom Tab.
- `POST /api/paychangu/webhook` — PayChangu calls this when the payment
  completes. Verifies the signature, re-verifies the transaction directly
  with PayChangu (never trusts the webhook body alone), then writes the
  same Firestore fields your Kotlin `TradeRepository.markFundsLocked()`
  would have written — so the Android app's existing real-time Firestore
  listener picks it up automatically. No polling needed on the happy path.
- `GET /api/paychangu/status?txRef=...` — manual fallback the app can call
  if the webhook seems slow (PayChangu's own docs recommend not relying on
  webhooks alone). Safe to call repeatedly.

## One-time setup

### 1. Firebase Admin credentials
Firebase Console → Project Settings → Service Accounts → **Generate new
private key**. That downloads a JSON file. Copy three fields out of it into
your env vars (see `.env.example`): `project_id`, `client_email`,
`private_key`.

### 2. PayChangu account
Sign up at paychangu.com, then from the dashboard:
- **API keys** page → copy your **test secret key** (starts with `sec-test-`)
  into `PAYCHANGU_SECRET_KEY`. Switch to the live key only once you're ready
  to take real money.
- **Settings → API & Webhooks** → add a webhook. You won't have a real
  `APP_BASE_URL` until after your first Vercel deploy, so deploy first with
  a placeholder webhook URL, then come back and update it once you know
  your real Vercel URL. Copy the webhook secret it generates into
  `PAYCHANGU_WEBHOOK_SECRET`.

### 3. Deploy to Vercel
```
npm install -g vercel   # if you don't have it
vercel
```
Follow the prompts (link/create a project). Then in the Vercel dashboard →
your project → Settings → Environment Variables, add everything from
`.env.example` with your real values. Redeploy after adding them
(`vercel --prod`).

Once deployed, set `APP_BASE_URL` to the exact URL Vercel gives you (e.g.
`https://escrow-p2p-paychangu.vercel.app`, no trailing slash), redeploy
once more, then go back to PayChangu's dashboard and set the webhook URL to
`{APP_BASE_URL}/api/paychangu/webhook`.

### 4. Local development (optional)
```
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```
Runs at `http://localhost:3000`. Note: PayChangu's webhook can't reach
`localhost` directly — use a tunnel (e.g. `ngrok http 3000`) and set
`APP_BASE_URL` to the tunnel URL while testing locally.

## Calling it from Android

```
POST {APP_BASE_URL}/api/paychangu/initiate
Content-Type: application/json

{
  "tradeId": "abc123",
  "buyerEmail": "buyer@example.com",
  "buyerName": "Jane Banda"
}
```
Response:
```json
{ "checkoutUrl": "https://checkout.paychangu.com/...", "txRef": "trade_abc123_1234567890" }
```
Open `checkoutUrl` in a browser (Custom Tabs recommended). Once the buyer
pays, the webhook fires automatically and the trade's `txHash` field
updates in Firestore — the app's existing trade listener will reflect this
without any extra code.

If you want a manual "Refresh status" button as a fallback, call:
```
GET {APP_BASE_URL}/api/paychangu/status?txRef=trade_abc123_1234567890
```

## Verified

This backend has been installed, type-checked (`tsc --noEmit`), and
production-built (`next build`) successfully — all three API routes compile
as expected dynamic serverless functions. One thing I could *not* verify
without your real PayChangu/Firebase credentials: an actual end-to-end
payment (see "A note on the webhook payload shape" below for what to check
if it doesn't fire correctly on first real test).

`npm audit` is clean except one moderate-severity issue nested two levels
inside `firebase-admin`'s own dependency tree (`gaxios` → `uuid`, a buffer
bounds-check issue). It isn't exploitable here — nothing in this app passes
attacker-controlled input into UUID generation — and forcing an upgrade
risked breaking `firebase-admin`'s dependency resolution, so it's left as
publisher's-responsibility rather than force-patched.

## A note on the webhook payload shape

PayChangu's docs show slightly different example payloads for direct-charge
vs. standard-checkout webhooks, so `webhook/route.ts` doesn't fully trust
any single field name from the webhook body — it pulls whatever
reference-like field it can find, then calls PayChangu's own
`verify-payment` endpoint to get the authoritative status and reference.
This happens to also be exactly what PayChangu's docs recommend doing
anyway ("Always Re-query"), so it's not a hack — but if you test against
PayChangu's sandbox and the webhook doesn't seem to trigger anything, check
your Vercel function logs: `console.log("PayChangu webhook payload:", ...)`
in `webhook/route.ts` prints the raw payload, so you can confirm the field
name and adjust `candidateTxRef` if needed.

## Simulated release/refund

Per the project's current scope, releasing funds to the seller and
refunding the buyer are **not** wired to a real PayChangu payout — the
Android app just updates the trade status directly in Firestore when the
buyer confirms receipt or requests a refund. This backend only handles the
collection (buyer → platform) side. See the Android-side changes for where
that happens (`EscrowViewModel.releaseFunds` / `refundBuyer`).

# Paychangu-backend-mobile
