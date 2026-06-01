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
    msg.includes('read_inventory') ||
    msg.includes('merchant approval')
  );
}

function isShopifyGraphqlFieldError(err) {
  const msg = String(err?.message || err);
  return msg.includes('GraphQL') || msg.includes("doesn't exist on type");
}

function formatMeasurementDimensions(dims) {
  if (!dims || typeof dims !== 'object') return null;
  const len = dims.length ?? dims.depth;
  const wid = dims.width;
  const hei = dims.height;
  if (len == null || wid == null || hei == null) return null;
  const unit = normalizeUnit(dims.unit);
  const fmt = (n) => {
    const num = Number(n);
    return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
  };
  return `${fmt(len)} × ${fmt(wid)} × ${fmt(hei)} (${unit})`;
}

async function shopifyGraphql(query, variables = {}) {
  const token = await getAccessToken();
  const res = await fetch(adminUrl('/graphql.json'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Shopify GraphQL error (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || payload.errors?.length) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(payload.errors || text.slice(0, 300))}`);
  }
  return payload.data;
}

function metafieldsFromGraphqlNodes(nodes = []) {
  return nodes.map((n) => ({
    key: n.key,
    value: n.value,
    type: n.type,
    namespace: 'custom',
  }));
}

/** GraphQL: custom.item_dimensions / custom.dimensions (measurement has weight only, no dimensions) */
async function getVariantDimensionsGraphQL(variantId, productId = null) {
  const vid = `gid://shopify/ProductVariant/${variantId}`;

  try {
    if (productId) {
      const data = await shopifyGraphql(
        `query VariantDims($vid: ID!, $pid: ID!) {
          productVariant(id: $vid) {
            metafields(first: 25, namespace: "custom") {
              nodes { key value type }
            }
          }
          product(id: $pid) {
            metafields(first: 25, namespace: "custom") {
              nodes { key value type }
            }
          }
        }`,
        { vid, pid: `gid://shopify/Product/${productId}` }
      );
      const fromVariant = pickDimensionsFromMetafields(
        metafieldsFromGraphqlNodes(data?.productVariant?.metafields?.nodes)
      );
      if (fromVariant) return fromVariant;
      return pickDimensionsFromMetafields(
        metafieldsFromGraphqlNodes(data?.product?.metafields?.nodes)
      );
    }

    const data = await shopifyGraphql(
      `query VariantDims($vid: ID!) {
        productVariant(id: $vid) {
          metafields(first: 25, namespace: "custom") {
            nodes { key value type }
          }
        }
      }`,
      { vid }
    );
    return pickDimensionsFromMetafields(
      metafieldsFromGraphqlNodes(data?.productVariant?.metafields?.nodes)
    );
  } catch (err) {
    if (isShopifyScopeError(err) || isShopifyGraphqlFieldError(err)) return null;
    throw err;
  }
}

/** Package size from REST inventory item (Shopify admin Shipping → Package) */
async function getVariantShippingDimensions(variantId, productId = null) {
  if (!variantId) return null;
  try {
    const vData = await shopifyFetch(`/variants/${variantId}.json`);
    const invId = vData.variant?.inventory_item_id;
    if (invId) {
      const invData = await shopifyFetch(`/inventory_items/${invId}.json`);
      const inv = invData.inventory_item || {};
      const fromMeasurement = formatMeasurementDimensions(inv.measurement?.dimensions);
      if (fromMeasurement) return fromMeasurement;
      const legacy = formatMeasurementDimensions(inv.dimensions);
      if (legacy) return legacy;
    }
  } catch (err) {
    if (!isShopifyScopeError(err)) throw err;
  }

  try {
    return await getVariantDimensionsGraphQL(variantId, productId);
  } catch (err) {
    if (isShopifyScopeError(err) || isShopifyGraphqlFieldError(err)) return null;
    throw err;
  }
}

async function loadInventoryDimensions(order) {
  const items = order.line_items || [];
  return Promise.all(
    items.map(async (item) => {
      if (item.packing_slip_dimensions) return item;
      if (!item.variant_id) return item;
      const dim = await getVariantShippingDimensions(item.variant_id, item.product_id);
      return dim ? { ...item, packing_slip_dimensions: dim } : item;
    })
  );
}

function dimensionsFromLineItem(item) {
  const prop = (item.properties || []).find((p) =>
    /dimension|size|measure/i.test(String(p.name || ''))
  );
  return prop?.value ? String(prop.value).trim() : null;
}

const DIMENSION_METAFIELD_KEYS = [
  'item_dimensions',
  'dimensions',
  'item_dimension',
  'product_dimensions',
  'package_dimensions',
];

function normalizeUnit(unit) {
  return String(unit || 'cm')
    .toLowerCase()
    .replace('centimeters', 'cm')
    .replace('centimetres', 'cm')
    .replace('inches', 'in')
    .replace('millimeters', 'mm');
}

/** Shopify dimension metafield JSON → readable L × W × H */
export function formatDimensionMetafieldValue(value, type = '') {
  if (value == null || value === '') return null;
  const t = String(type || '').toLowerCase();

  if (typeof value === 'object' && value !== null) {
    const block = value.value && typeof value.value === 'object' ? value.value : value;
    const len = block.length ?? block.l;
    const wid = block.width ?? block.w;
    const hei = block.height ?? block.h;
    if (len != null && wid != null && hei != null) {
      return `${len} × ${wid} × ${hei} (${normalizeUnit(block.unit || value.unit)})`;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (t.includes('dimension') || raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const parts = parsed.map((entry) => formatDimensionMetafieldValue(entry, 'dimension')).filter(Boolean);
        if (parts.length) return parts.join('; ');
      }
      const block = parsed?.value && typeof parsed.value === 'object' ? parsed.value : parsed;
      const len = block?.length ?? block?.l;
      const wid = block?.width ?? block?.w;
      const hei = block?.height ?? block?.h;
      if (len != null && wid != null && hei != null) {
        return `${len} × ${wid} × ${hei} (${normalizeUnit(block.unit || parsed.unit)})`;
      }
    } catch {
      // plain text value
    }
  }

  return raw;
}

function pickDimensionsFromMetafields(metafields = []) {
  for (const key of DIMENSION_METAFIELD_KEYS) {
    const mf = metafields.find((m) => m.key === key);
    if (mf) {
      const text = formatDimensionMetafieldValue(mf.value, mf.type);
      if (text) return text;
    }
  }
  const fuzzy = metafields.find((m) => /dimension|package.?size/i.test(String(m.key || '')));
  if (fuzzy) {
    const text = formatDimensionMetafieldValue(fuzzy.value, fuzzy.type);
    if (text) return text;
  }
  return null;
}

async function listProductMetafields(productId) {
  if (!productId) return [];
  const data = await shopifyFetch(`/products/${productId}/metafields.json?limit=100`);
  return data.metafields || [];
}

async function listVariantMetafields(variantId) {
  if (!variantId) return [];
  const data = await shopifyFetch(`/variants/${variantId}/metafields.json?limit=100`);
  return data.metafields || [];
}

async function loadMetafieldDimensions(order) {
  const items = order.line_items || [];
  const dimByProduct = {};

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  await Promise.all(
    productIds.map(async (productId) => {
      const mfs = await listProductMetafields(productId);
      const dim = pickDimensionsFromMetafields(mfs);
      if (dim) dimByProduct[productId] = dim;
    })
  );

  return Promise.all(
    items.map(async (item) => {
      if (item.packing_slip_dimensions) return item;
      let dim = dimensionsFromLineItem(item);
      if (!dim && item.product_id) dim = dimByProduct[item.product_id] || null;
      if (!dim && item.variant_id) {
        const vMfs = await listVariantMetafields(item.variant_id);
        dim = pickDimensionsFromMetafields(vMfs);
      }
      return dim ? { ...item, packing_slip_dimensions: dim } : item;
    })
  );
}

/** Load dimensions: line properties → metafields → inventory package (Shipping tab) */
export async function enrichOrderForPackingSlip(order) {
  const items = order.line_items || [];
  if (!items.length) return order;

  let line_items = items.map((item) => {
    const dim = dimensionsFromLineItem(item);
    return dim ? { ...item, packing_slip_dimensions: dim } : item;
  });

  try {
    line_items = await loadMetafieldDimensions({ ...order, line_items });
  } catch (err) {
    if (!isShopifyScopeError(err) && !isShopifyGraphqlFieldError(err)) throw err;
  }

  if (!line_items.every((i) => i.packing_slip_dimensions)) {
    try {
      line_items = await loadInventoryDimensions({ ...order, line_items });
    } catch (err) {
      if (!isShopifyScopeError(err) && !isShopifyGraphqlFieldError(err)) throw err;
    }
  }

  return { ...order, line_items };
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
