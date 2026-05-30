import { getOrder } from './shopify.js';
import { summarizeOrder } from './map-order.js';
import { recordGeneratedOrder } from './generated-orders.js';
import { trackingUrl } from './bluedart.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { labelsDir } from './paths.js';

export function extractBlueDartAwb(order) {
  for (const fulfillment of order.fulfillments || []) {
    const company = String(fulfillment.tracking_company || '').toLowerCase();
    const number = String(fulfillment.tracking_number || '').trim();
    if (company.includes('blue') && /^\d+$/.test(number)) {
      return number;
    }
  }
  return null;
}

export function whyNotInUnfulfilledList(order) {
  if (order.cancelled_at) {
    return 'This order is cancelled — it will not appear in the unfulfilled list.';
  }
  if (order.closed_at) {
    return 'This order is closed/archived — it will not appear in the unfulfilled list.';
  }
  if (order.fulfillment_status === 'fulfilled') {
    return 'This order is already fulfilled in Shopify — it is hidden from the unfulfilled list. Use Generated labels (below) to print again.';
  }
  if (order.fulfillment_status === 'partial') {
    return 'This order is partially fulfilled — it may still show in the unfulfilled list if some items are open.';
  }
  return 'This order should appear in the unfulfilled list. Click Refresh or check the next page (25 per page).';
}

export function showInUnfulfilledList(order) {
  if (order.cancelled_at || order.closed_at) return false;
  return order.fulfillment_status !== 'fulfilled';
}

function printUrls(awb, orderName) {
  const orderQuery = orderName ? `?order=${encodeURIComponent(orderName)}` : '';
  return {
    awb: String(awb),
    packingSlipUrl: `/api/packing-slip/${awb}${orderQuery}`,
    labelPrintUrl: `/api/print-label/${awb}`,
    labelPdfUrl: `/api/labels/${awb}.pdf`,
    trackingUrl: trackingUrl(awb),
    hasLabelPdf: existsSync(resolve(labelsDir, `${awb}.pdf`)),
    hasPackingSlip: existsSync(resolve(labelsDir, `${awb}-packing-slip.html`)),
  };
}

/** Find any order by name/ID — explains missing from unfulfilled list + print links if AWB exists. */
export async function lookupOrder(orderIdOrName) {
  const order = await getOrder(orderIdOrName);
  const summary = summarizeOrder(order);
  const awb = extractBlueDartAwb(order);
  const inUnfulfilledList = showInUnfulfilledList(order);
  const reason = whyNotInUnfulfilledList(order);

  if (awb) {
    recordGeneratedOrder({
      orderId: order.id,
      orderName: order.name,
      awb,
      customer: summary.customer,
      total: summary.total,
      labelSaved: existsSync(resolve(labelsDir, `${awb}.pdf`)),
    });
  }

  return {
    order: summary,
    inUnfulfilledList,
    reason,
    awb,
    ...(awb ? printUrls(awb, order.name) : {}),
  };
}
