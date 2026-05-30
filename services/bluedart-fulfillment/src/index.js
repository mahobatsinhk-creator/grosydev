import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

import { config, assertBlueDartConfig, assertBlueDartAuthConfig, assertShopifyConfig } from './config.js';
import { getShippingJwt, checkPincodeServiceability } from './bluedart.js';
import { listUnfulfilledOrders, testShopifyConnection } from './shopify.js';
import { summarizeOrder } from './map-order.js';
import { labelsDir } from './paths.js';
import { processOrder } from './fulfill.js';
import { processAllUnfulfilled } from './batch.js';
import { verifyShopifyWebhook, parseWebhookOrder, shouldAutoFulfillOrder } from './webhook.js';
import { buildLabelPrintHtml } from './packing-slip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(labelsDir, { recursive: true });

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function unauthorized(req, res) {
  if (!config.apiSecret) return false;
  const header = req.headers['x-api-secret'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (header !== config.apiSecret) {
    json(res, 401, { error: 'Unauthorized' });
    return true;
  }
  return false;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  const text = raw.toString('utf8');
  return { raw, data: text ? JSON.parse(text) : {} };
}

function serveStatic(res, filePath, contentType) {
  if (!existsSync(filePath)) {
    json(res, 404, { error: 'Not found' });
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(readFileSync(filePath));
}

function startAutoFulfillCron() {
  const mode = config.autoFulfillMode;
  const minutes = config.autoFulfillCronMinutes;
  if (!minutes || minutes < 1) return;
  if (mode !== 'batch' && mode !== 'all') return;

  const run = async () => {
    try {
      console.log('[auto-fulfill] Running batch…');
      const result = await processAllUnfulfilled({
        limit: config.autoFulfillBatchLimit,
        notifyCustomer: config.autoFulfillNotifyCustomer,
      });
      console.log(
        `[auto-fulfill] Done: ${result.success}/${result.processed} succeeded, ${result.failed} failed`
      );
    } catch (err) {
      console.error('[auto-fulfill] Error:', err.message || err);
    }
  };

  run();
  setInterval(run, minutes * 60 * 1000);
  console.log(`[auto-fulfill] Batch every ${minutes} minutes (mode: ${mode})`);
}

export function startServer() {
  const publicDir = resolve(__dirname, '../public');

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/') {
        serveStatic(res, resolve(publicDir, 'index.html'), 'text/html; charset=utf-8');
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, {
          ok: true,
          shop: config.shopify.shop,
          autoFulfillMode: config.autoFulfillMode,
        });
        return;
      }

      // Shopify webhook — verified by HMAC, not API secret
      if (req.method === 'POST' && url.pathname === '/webhooks/shopify/orders-paid') {
        const raw = await readRawBody(req);
        const hmac = req.headers['x-shopify-hmac-sha256'];
        if (!verifyShopifyWebhook(raw.toString('utf8'), hmac)) {
          json(res, 401, { error: 'Invalid webhook signature' });
          return;
        }

        const mode = config.autoFulfillMode;
        if (mode !== 'webhook' && mode !== 'all') {
          json(res, 200, { skipped: true, reason: 'AUTO_FULFILL_MODE is not webhook/all' });
          return;
        }

        const webhookOrder = parseWebhookOrder(raw.toString('utf8'));
        if (!shouldAutoFulfillOrder(webhookOrder)) {
          json(res, 200, { skipped: true, order: webhookOrder.name });
          return;
        }

        const result = await processOrder(webhookOrder.id, {
          notifyCustomer: config.autoFulfillNotifyCustomer,
        });
        json(res, 200, result);
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/labels/')) {
        const awb = url.pathname.replace('/api/labels/', '').replace(/\.pdf$/i, '');
        if (!/^\d+$/.test(awb)) {
          json(res, 400, { error: 'Invalid AWB' });
          return;
        }
        const labelPath = resolve(labelsDir, `${awb}.pdf`);
        if (!existsSync(labelPath)) {
          json(res, 404, { error: 'Label not found' });
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end(readFileSync(labelPath));
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/packing-slip/')) {
        const awb = url.pathname.replace('/api/packing-slip/', '').replace(/\.html$/i, '');
        if (!/^\d+$/.test(awb)) {
          json(res, 400, { error: 'Invalid AWB' });
          return;
        }
        const slipPath = resolve(labelsDir, `${awb}-packing-slip.html`);
        if (existsSync(slipPath)) {
          serveStatic(res, slipPath, 'text/html; charset=utf-8');
          return;
        }
        json(res, 404, { error: 'Packing slip not found — re-fulfill order or run regenerate script' });
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/print-label/')) {
        const awb = url.pathname.replace('/api/print-label/', '');
        if (!/^\d+$/.test(awb)) {
          json(res, 400, { error: 'Invalid AWB' });
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildLabelPrintHtml(awb));
        return;
      }

      if (unauthorized(req, res)) return;

      if (req.method === 'GET' && url.pathname === '/api/shopify/test') {
        assertShopifyConfig();
        const shop = await testShopifyConnection();
        json(res, 200, { ok: true, shop });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/orders/unfulfilled') {
        assertShopifyConfig();
        const orders = await listUnfulfilledOrders(Number(url.searchParams.get('limit') || 25));
        json(res, 200, { orders: orders.map(summarizeOrder) });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/bluedart/test-auth') {
        assertBlueDartAuthConfig();
        const token = await getShippingJwt(true);
        json(res, 200, { ok: true, tokenLength: token.length, originArea: config.bluedart.originArea });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/bluedart/pincode') {
        assertBlueDartAuthConfig();
        const pin = url.searchParams.get('pin');
        if (!pin) {
          json(res, 400, { error: 'pin query param required' });
          return;
        }
        const result = await checkPincodeServiceability(pin);
        json(res, 200, { pincode: pin, result });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/fulfill/batch') {
        const { data: body } = await readJsonBody(req);
        const result = await processAllUnfulfilled({
          limit: Number(body.limit || config.autoFulfillBatchLimit),
          notifyCustomer: body.notifyCustomer !== false,
        });
        json(res, 200, result);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/fulfill') {
        const { data: body } = await readJsonBody(req);
        const orderId = body.orderId || body.order || url.searchParams.get('order');
        if (!orderId) {
          json(res, 400, { error: 'orderId required' });
          return;
        }
        const result = await processOrder(orderId, {
          notifyCustomer: body.notifyCustomer !== false,
          dryRun: body.dryRun === true,
        });
        json(res, 200, result);
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      json(res, 500, { error: err.message || String(err) });
    }
  });

  server.listen(config.port, '0.0.0.0', () => {
    const local = `http://localhost:${config.port}`;
    console.log(`Grosyhub Blue Dart fulfillment: ${local}`);
    if (config.publicUrl) {
      console.log(`Live dashboard: ${config.publicUrl}`);
      console.log(`Webhook: ${config.publicUrl}/webhooks/shopify/orders-paid`);
    }
    console.log('Shiprocket checkout is unchanged — this only runs after orders are placed.');
    startAutoFulfillCron();
  });
}

export { processOrder };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}
