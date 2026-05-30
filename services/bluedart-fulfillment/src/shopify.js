import { config } from './config.js';

function adminUrl(path) {
  const shop = config.shopify.shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${shop}/admin/api/${config.shopify.apiVersion}${path}`;
}

async function shopifyFetch(path, options = {}) {
  const res = await fetch(adminUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.shopify.accessToken,
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
  const id = String(orderIdOrName).replace(/^#/, '').trim();

  if (/^\d+$/.test(id)) {
    const data = await shopifyFetch(`/orders/${id}.json`);
    return data.order;
  }

  const data = await shopifyFetch(`/orders.json?name=${encodeURIComponent(id)}&status=any&limit=1`);
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
