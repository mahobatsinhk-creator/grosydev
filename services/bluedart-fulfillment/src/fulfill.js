import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertBlueDartConfig, assertShopifyConfig } from './config.js';
import { generateWaybill, trackingUrl } from './bluedart.js';
import { getOrder, fulfillOrderWithAwb } from './shopify.js';
import { shopifyOrderToWaybill, summarizeOrder } from './map-order.js';
import { savePackingSlip, saveLabelPrintPage } from './packing-slip.js';
import { labelsDir } from './paths.js';
import { recordGeneratedOrder } from './generated-orders.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export { labelsDir };

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
    saveLabelPrintPage(waybill.awb);
  }

  savePackingSlip(order, waybill.awb, waybill.raw);

  const fulfillment = await fulfillOrderWithAwb(order, waybill.awb, { notifyCustomer });

  recordGeneratedOrder({
    orderId: order.id,
    orderName: order.name,
    awb: waybill.awb,
    customer: order.shipping_address?.name || order.email || '',
    total: order.total_price,
    labelSaved: Boolean(waybill.pdfBase64),
  });

  return {
    order: summarizeOrder(order),
    awb: waybill.awb,
    trackingUrl: trackingUrl(waybill.awb),
    fulfillmentId: fulfillment.id,
    labelSaved: Boolean(waybill.pdfBase64),
    packingSlipUrl: `/api/packing-slip/${waybill.awb}?order=${encodeURIComponent(order.name)}`,
    labelPrintUrl: `/api/print-label/${waybill.awb}`,
  };
}
