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

function parseLinkHeader(linkHeader) {
  const result = { next: null, previous: null };
  if (!linkHeader) return result;

  for (const part of linkHeader.split(',')) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="(\w+)"/);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      const pageInfo = url.searchParams.get('page_info');
      if (match[2] === 'next') result.next = pageInfo;
      if (match[2] === 'previous') result.previous = pageInfo;
    } catch {
      // ignore malformed link entries
    }
  }

  return result;
}

async function shopifyFetchMeta(path, options = {}) {
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

  return { data, link: parseLinkHeader(res.headers.get('link')) };
}

async function shopifyFetch(path, options = {}) {
  const { data } = await shopifyFetchMeta(path, options);
  return data;
}

function isShopifyScopeError(err) {
  const msg = String(err?.message || err);
  return (
    msg.includes('403') ||
    msg.includes('read_products') ||
    msg.includes('merchant approval')
  );
}

function dimensionsFromLineItem(item) {
  const prop = (item.properties || []).find((p) =>
    /dimension|size|measure/i.test(String(p.name || ''))
  );
  return prop?.value ? String(prop.value).trim() : null;
}

function parseMetafieldValue(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw).trim();
}

async function getProductMetafieldValue(productId, key) {
  if (!productId) return null;
  const data = await shopifyFetch(
    `/products/${productId}/metafields.json?namespace=custom&key=${encodeURIComponent(key)}&limit=1`
  );
  return parseMetafieldValue(data.metafields?.[0]?.value);
}

async function getVariantMetafieldValue(variantId, key) {
  if (!variantId) return null;
  const data = await shopifyFetch(
    `/variants/${variantId}/metafields.json?namespace=custom&key=${encodeURIComponent(key)}&limit=1`
  );
  return parseMetafieldValue(data.metafields?.[0]?.value);
}

async function loadMetafieldDimensions(order) {
  const items = order.line_items || [];
  const dimByProduct = {};

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  await Promise.all(
    productIds.map(async (productId) => {
      const dim =
        (await getProductMetafieldValue(productId, 'item_dimensions')) ||
        (await getProductMetafieldValue(productId, 'dimensions'));
      if (dim) dimByProduct[productId] = dim;
    })
  );

  return Promise.all(
    items.map(async (item) => {
      let dim = dimensionsFromLineItem(item);
      if (!dim && item.product_id) dim = dimByProduct[item.product_id] || null;
      if (!dim && item.variant_id) {
        dim =
          (await getVariantMetafieldValue(item.variant_id, 'item_dimensions')) ||
          (await getVariantMetafieldValue(item.variant_id, 'dimensions'));
      }
      return dim ? { ...item, packing_slip_dimensions: dim } : item;
    })
  );
}

/** Load dimensions for packing slip (properties first; product metafields when scope allows) */
export async function enrichOrderForPackingSlip(order) {
  const items = order.line_items || [];
  if (!items.length) return order;

  const fromProperties = items.map((item) => {
    const dim = dimensionsFromLineItem(item);
    return dim ? { ...item, packing_slip_dimensions: dim } : item;
  });

  if (fromProperties.every((i) => i.packing_slip_dimensions)) {
    return { ...order, line_items: fromProperties };
  }

  try {
    const line_items = await loadMetafieldDimensions({ ...order, line_items: fromProperties });
    return { ...order, line_items };
  } catch (err) {
    if (isShopifyScopeError(err)) {
      return { ...order, line_items: fromProperties };
    }
    throw err;
  }
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
  const found = data.orders?.[0];
  if (!found) throw new Error(`Order not found: ${orderIdOrName}`);
  const full = await shopifyFetch(`/orders/${found.id}.json`);
  return full.order;
}

export async function listUnfulfilledOrdersPage({ limit = 25, pageInfo = '' } = {}) {
  const capped = Math.min(Math.max(1, Number(limit) || 25), 250);
  const path = pageInfo
    ? `/orders.json?limit=${capped}&page_info=${encodeURIComponent(pageInfo)}`
    : `/orders.json?status=open&fulfillment_status=unfulfilled,partial&limit=${capped}`;

  const { data, link } = await shopifyFetchMeta(path);

  return {
    orders: data.orders || [],
    pagination: {
      limit: capped,
      nextPageInfo: link.next,
      prevPageInfo: link.previous,
      hasNext: Boolean(link.next),
      hasPrevious: Boolean(link.previous),
    },
  };
}

export async function listUnfulfilledOrders(limit = 25) {
  const { orders } = await listUnfulfilledOrdersPage({ limit });
  return orders;
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
