import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

import { config, assertBlueDartConfig, assertBlueDartAuthConfig, assertShopifyConfig } from './config.js';
import { getShippingJwt, generateWaybill, checkPincodeServiceability, trackingUrl } from './bluedart.js';
import { getOrder, listUnfulfilledOrders, fulfillOrderWithAwb } from './shopify.js';
import { shopifyOrderToWaybill, summarizeOrder } from './map-order.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const labelsDir = resolve(__dirname, '../labels');
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

export async function processOrder(orderIdOrName, { notifyCustomer = true, dryRun = false } = {}) {
  assertBlueDartConfig();
  assertShopifyConfig();

  const order = await getOrder(orderIdOrName);
  const payload = shopifyOrderToWaybill(order);

  if (dryRun) {
    return { order: summarizeOrder(order), payload, dryRun: true };
  }

  const waybill = await generateWaybill(payload);
  if (!waybill.awb) {
    throw new Error('Waybill created but AWB number missing in response');
  }

  if (waybill.pdfBase64) {
    const labelPath = resolve(labelsDir, `${waybill.awb}.pdf`);
    writeFileSync(labelPath, Buffer.from(waybill.pdfBase64, 'base64'));
  }

  const fulfillment = await fulfillOrderWithAwb(order, waybill.awb, { notifyCustomer });

  return {
    order: summarizeOrder(order),
    awb: waybill.awb,
    trackingUrl: trackingUrl(waybill.awb),
    fulfillmentId: fulfillment.id,
    labelSaved: Boolean(waybill.pdfBase64),
  };
}

function serveStatic(res, filePath, contentType) {
  if (!existsSync(filePath)) {
    json(res, 404, { error: 'Not found' });
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(readFileSync(filePath));
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
        json(res, 200, { ok: true, shop: config.shopify.shop });
        return;
      }

      if (unauthorized(req, res)) return;

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

      if (req.method === 'POST' && url.pathname === '/api/fulfill') {
        const body = await readBody(req);
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

  server.listen(config.port, () => {
    console.log(`Grosyhub Blue Dart fulfillment: http://localhost:${config.port}`);
    console.log('Shiprocket checkout is unchanged — this only runs after orders are placed.');
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}
