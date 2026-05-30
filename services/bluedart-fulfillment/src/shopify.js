import { config } from './config.js';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function shopDomain() {
  return config.shopify.shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function adminUrl(path) {
  return `https://${shopDomain()}/admin/api/${config.shopify.apiVersion}${path}`;
}

async function getAccessToken() {
  const now = Date.now();

  if (config.shopify.accessToken) {
    return config.shopify.accessToken;
  }

  if (!config.shopify.clientId || !config.shopify.clientSecret) {
    throw new Error('Shopify credentials missing in .env');
  }

  if (cachedAccessToken && now < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.shopify.clientId,
    client_secret: config.shopify.clientSecret,
  });

  const res = await fetch(`https://${shopDomain()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Shopify token error (${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok || !data.access_token) {
    throw new Error(`Shopify token error (${res.status}): ${JSON.stringify(data)}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 86_400) * 1000;
  return cachedAccessToken;
}

async function shopifyFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(adminUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...options.headers,
    },
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const msg = data?.errors || data?.error || text.slice(0, 300);
    throw new Error(`Shopify ${res.status}: ${JSON.stringify(msg)}`);
  }

  return data;
}

export async function getOrder(orderIdOrName) {
  const raw = String(orderIdOrName).trim();
  const withoutHash = raw.replace(/^#/, '');

  // Long numeric values are Shopify internal IDs (e.g. 5678901234567)
  if (/^\d{10,}$/.test(withoutHash)) {
    const data = await shopifyFetch(`/orders/${withoutHash}.json`);
    return data.order;
  }

  // Short numbers like 1458 are order names (#1458), not internal IDs
  const orderName = raw.startsWith('#') ? raw : `#${withoutHash}`;
  const data = await shopifyFetch(
    `/orders.json?name=${encodeURIComponent(orderName)}&status=any&limit=1`
  );
  const order = data.orders?.[0];
  if (!order) throw new Error(`Order not found: ${orderIdOrName}`);
  return order;
}

export async function listUnfulfilledOrders(limit = 25) {
  const data = await shopifyFetch(
    `/orders.json?status=open&fulfillment_status=unfulfilled,partial&limit=${limit}`
  );
  return data.orders || [];
}

export async function getFulfillmentOrders(orderId) {
  const data = await shopifyFetch(`/orders/${orderId}/fulfillment_orders.json`);
  return data.fulfillment_orders || [];
}

export async function createFulfillment({ fulfillmentOrderId, awb, notifyCustomer = true }) {
  const body = {
    fulfillment: {
      line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrderId }],
      tracking_info: {
        number: String(awb),
        company: 'Blue Dart',
        url: `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(awb)}`,
      },
      notify_customer: notifyCustomer,
    },
  };

  const data = await shopifyFetch('/fulfillments.json', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return data.fulfillment;
}

export async function addOrderMetafield(orderId, awb) {
  const body = {
    metafield: {
      namespace: 'bluedart',
      key: 'awb',
      value: String(awb),
      type: 'single_line_text_field',
    },
  };

  return shopifyFetch(`/orders/${orderId}/metafields.json`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fulfillOrderWithAwb(order, awb, { notifyCustomer = true } = {}) {
  const fulfillmentOrders = await getFulfillmentOrders(order.id);
  const open = fulfillmentOrders.filter(
    (fo) => fo.status === 'open' || fo.status === 'in_progress'
  );

  if (open.length === 0) {
    throw new Error(`No open fulfillment orders for Shopify order ${order.name}`);
  }

  const fulfillment = await createFulfillment({
    fulfillmentOrderId: open[0].id,
    awb,
    notifyCustomer,
  });

  try {
    await addOrderMetafield(order.id, awb);
  } catch {
    // metafield is optional
  }

  return fulfillment;
}

export async function testShopifyConnection() {
  const data = await shopifyFetch('/shop.json');
  return { name: data.shop?.name, domain: data.shop?.domain };
}
