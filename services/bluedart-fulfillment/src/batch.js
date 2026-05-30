import { listUnfulfilledOrders } from './shopify.js';
import { processOrder } from './fulfill.js';
import { summarizeOrder } from './map-order.js';

export async function processAllUnfulfilled({ limit = 50, notifyCustomer = true } = {}) {
  const orders = await listUnfulfilledOrders(limit);
  const results = [];

  for (const order of orders) {
    const summary = summarizeOrder(order);
    try {
      const result = await processOrder(order.id, { notifyCustomer });
      results.push({
        ok: true,
        order: summary.name,
        orderId: order.id,
        awb: result.awb,
        packingSlipUrl: result.packingSlipUrl,
        labelPrintUrl: result.labelPrintUrl,
        trackingUrl: result.trackingUrl,
      });
    } catch (err) {
      results.push({ ok: false, order: summary.name, error: err.message || String(err) });
    }
  }

  return {
    processed: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
