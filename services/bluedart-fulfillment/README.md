# Grosyhub Blue Dart Fulfillment

Post-checkout Blue Dart integration for **igh9a1-1h.myshopify.com**.

**Shiprocket fast checkout is not modified.** Orders still checkout via Shiprocket; this tool runs afterward to create Blue Dart AWBs and mark Shopify orders fulfilled with tracking.

## What it does

1. Loads unfulfilled Shopify orders (Admin API)
2. Maps order → Blue Dart `GenerateWayBill` payload
3. Creates AWB + saves label PDF to `labels/`
4. Fulfills the order in Shopify with Blue Dart tracking (customer gets shipped email)

Pickup: **385001** (Palanpur / area **PLN**). Delivers pan-India via Blue Dart network.

## One-time setup

### 1. Blue Dart Customer Code

Your account: **PLN347970** → API uses area **PLN** + customer code **347970**.

Set either format in `.env`:

```env
BLUEDART_CUSTOMER_CODE=PLN347970
# or
BLUEDART_CUSTOMER_CODE=347970
BLUEDART_ORIGIN_AREA=PLN
```

Production waybill generation verified with this account.

### 2. Shopify Custom App

In Shopify Admin → Settings → Apps → Develop apps:

- Create a custom app
- Scopes: `read_orders`, `write_fulfillments`, `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`
- Install and copy **Admin API access token** → `SHOPIFY_ACCESS_TOKEN`

This does **not** change checkout or Shiprocket.

### 3. Configure environment

```bash
cd services/bluedart-fulfillment
cp .env.example .env
# Edit .env — fill passwords, licence keys, customer code, warehouse address
```

Never commit `.env` or paste credentials in GitHub.

### 4. Run

```bash
npm start
# Open http://localhost:8787
```

Or CLI:

```bash
node src/cli.js test-auth          # verify Blue Dart login + pincode 385001
node src/cli.js dry-run 1001       # preview payload for order #1001
node src/cli.js fulfill 1001       # create AWB + fulfill in Shopify
```

Set `API_SECRET` in `.env` and use the same value in the web UI when calling APIs.

## Deploy (optional)

Run on any small host (Railway, Render, VPS). Use HTTPS + `API_SECRET`. No theme deploy required.

For auto-fulfill on every paid order, add a Shopify webhook `orders/paid` → `POST /api/fulfill` (only after Customer Code is verified in production).

## Files

| File | Role |
|------|------|
| `src/bluedart.js` | JWT auth, waybill, tracking |
| `src/shopify.js` | Orders + fulfillments |
| `src/map-order.js` | Shopify order → Blue Dart JSON |
| `public/index.html` | Simple ops dashboard |

## Security

- Rotate Blue Dart password if shared in chat
- Keep licence keys and tokens in `.env` only
- Theme repo (`grosydev`) has **zero** Blue Dart secrets
