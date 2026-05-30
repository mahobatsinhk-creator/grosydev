# Grosyhub Blue Dart Fulfillment

Post-checkout Blue Dart for **igh9a1-1h.myshopify.com**. **Shiprocket checkout is not modified.**

## How this fits your main project

```text
grosydev (GitHub theme)     →  Shopify store (storefront + Shiprocket checkout)
bluedart-fulfillment/       →  Separate server (AWB + labels + Shopify fulfill)
```

The theme and this service are **deployed separately**. No theme changes are required for live Blue Dart.

| Part | Where it runs |
|------|----------------|
| Storefront, cart, Shiprocket | Shopify theme (`shopify theme push` / GitHub) |
| Blue Dart AWB + labels | This Node app (PC, VPS, Railway, Render) |

---

## Generate AWBs for all orders (3 options)

### Option 1 — Manual batch (good to start)

Dashboard: **Fulfill all** button (after Load unfulfilled orders).

CLI:

```bash
npm run fulfill-all
# or limit: node src/cli.js fulfill-all 10
```

Processes every open unfulfilled order and creates AWB + Shopify tracking.

---

### Option 2 — Automatic on every paid order (live production)

1. Deploy this app to a public HTTPS URL (see below).
2. In `.env`:

```env
AUTO_FULFILL_MODE=webhook
PUBLIC_URL=https://your-app.up.railway.app
```

3. In **Dev Dashboard** → your app → **Versions** → add webhook:
   - Topic: `orders/paid`
   - URL: `https://your-app.up.railway.app/webhooks/shopify/orders-paid`
   - Release new version and reinstall on store if needed.

Each paid order automatically gets a Blue Dart AWB and Shopify fulfillment.

---

### Option 3 — Scheduled batch (e.g. every 30 minutes)

```env
AUTO_FULFILL_MODE=batch
AUTO_FULFILL_CRON_MINUTES=30
AUTO_FULFILL_BATCH_LIMIT=50
```

Server processes all unfulfilled orders on that interval. Good if you pack orders in batches.

Use `AUTO_FULFILL_MODE=all` for webhook + scheduled batch together.

---

## Go live with your domain

Your **store** stays at `grosyhub.com`. This tool gets its **own URL**, for example:

```text
https://shipping.grosyhub.com
```

(or `https://grosyhub-bluedart.onrender.com` until you add a custom domain)

---

### Step 1 — Deploy to Render (recommended)

1. Push `grosydev` repo to GitHub (if not already).
2. Go to [render.com](https://render.com) → **New → Web Service** → connect repo.
3. Settings:

| Setting | Value |
|---------|--------|
| Root directory | `services/bluedart-fulfillment` |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check | `/health` |

4. **Environment** — add all variables from your local `.env`:

```env
API_SECRET=use-a-long-random-production-secret
PUBLIC_URL=https://YOUR-SERVICE.onrender.com
BLUEDART_LOGIN_ID=PLN15697
BLUEDART_PASSWORD=...
BLUEDART_SHIPPING_LICENCE_KEY=...
BLUEDART_TRACKING_LICENCE_KEY=...
BLUEDART_CUSTOMER_CODE=PLN347970
BLUEDART_SHIPPER_ADDRESS1=...
BLUEDART_SHIPPER_MOBILE=...
SHOPIFY_SHOP=igh9a1-1h.myshopify.com
SHOPIFY_CLIENT_ID=8127b71d15f464a0ae898a6d00a6449b
SHOPIFY_CLIENT_SECRET=...
AUTO_FULFILL_MODE=manual
```

5. Click **Deploy** → copy your live URL (e.g. `https://grosyhub-bluedart.onrender.com`).

**Alternative:** Railway.app — same steps, root `services/bluedart-fulfillment`.

---

### Step 2 — Custom domain (shipping.grosyhub.com)

1. Render → your service → **Settings → Custom Domains** → add `shipping.grosyhub.com`.
2. In your domain DNS panel add:

| Type | Host | Points to |
|------|------|-----------|
| CNAME | shipping | `grosyhub-bluedart.onrender.com` |

3. Wait for SSL (green check, ~5–30 min).
4. Update env on Render:

```env
PUBLIC_URL=https://shipping.grosyhub.com
```

5. Redeploy / restart service.

---

### Step 3 — Use live dashboard daily

Open:

```text
https://shipping.grosyhub.com
```

- Enter production `API_SECRET` once (browser saves it).
- Orders auto-load.
- **Create AWB & fulfill** on each row.

**Print links on live server:**

```text
https://shipping.grosyhub.com/api/packing-slip/{AWB}
https://shipping.grosyhub.com/api/print-label/{AWB}
https://shipping.grosyhub.com/api/labels/{AWB}.pdf
```

---

### Step 4 — Auto AWB on every paid order (optional)

When ready for full automation:

1. Env on Render:

```env
AUTO_FULFILL_MODE=webhook
PUBLIC_URL=https://shipping.grosyhub.com
```

2. **Dev Dashboard** → Grosyhub Blue Dart Fulfillment → **Versions** → add webhook:

| Topic | URL |
|-------|-----|
| `orders/paid` | `https://shipping.grosyhub.com/webhooks/shopify/orders-paid` |

3. **Release** → reinstall on store if asked.

---

### What stays unchanged

| System | Changes? |
|--------|----------|
| grosyhub.com storefront | No |
| Shiprocket checkout | No |
| Theme GitHub repo | No deploy needed for Blue Dart |
| Blue Dart ops | New URL: shipping.grosyhub.com |

---

### Production checklist

- [ ] Deployed on Render/Railway with HTTPS
- [ ] Strong `API_SECRET` (not the local dev one)
- [ ] `PUBLIC_URL` set to live HTTPS URL
- [ ] Test: open live URL → fulfill one order
- [ ] Custom domain CNAME (optional)
- [ ] Webhook added (if auto mode)

---

## Go live (deploy) — quick reference

### Recommended: Railway or Render (free tier to start)

1. Push `services/bluedart-fulfillment` to GitHub (same repo is fine).
2. Create new **Web Service** on [Railway](https://railway.app) or [Render](https://render.com).
3. Root directory: `services/bluedart-fulfillment`
4. Start command: `npm start`
5. Add all `.env` variables in the hosting dashboard (never commit secrets).
6. Copy the public URL → set `PUBLIC_URL` in env.
7. Register Shopify webhook (Option 2 above) if using auto mode.

**Requirements:** Node 18+, persistent disk optional (labels stored on server; download via `/api/labels/{AWB}.pdf`).

### Keep running on your PC (simple, not 24/7)

```bash
cd services/bluedart-fulfillment
npm start
```

Use **Fulfill all** when you pack orders. PC must be on.

---

## Labels in production

After fulfill, download label:

```text
https://your-app.up.railway.app/api/labels/90532504952.pdf
```

(Use your API secret in dashboard for admin actions; label URLs are public AWB numbers only.)

Local path when running on PC:

```text
services/bluedart-fulfillment/labels/{AWB}.pdf
```

---

## Daily workflow (recommended)

1. Customer orders via Shiprocket (unchanged).
2. You pack orders.
3. Either:
   - Click **Fulfill all** on dashboard, or
   - Auto via webhook / cron if enabled.
4. Print labels from `labels/` folder or download URLs.
5. Hand packages to Blue Dart pickup.

---

## Commands

```bash
npm start                    # dashboard http://localhost:8787
npm run fulfill-all          # all unfulfilled orders
node src/cli.js fulfill 1458 # single order
node src/cli.js test-auth    # Blue Dart login test
```

---

## Security

- Rotate secrets if shared in chat.
- Set strong `API_SECRET` on production.
- Webhooks verified with Shopify HMAC (Client secret).
