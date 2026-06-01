import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { labelsDir } from './paths.js';
import { listGeneratedOrders } from './generated-orders.js';
import { getOrder, enrichOrderForPackingSlip } from './shopify.js';
import { buildBatchPackingSlipPrintHtml } from './packing-slip.js';

function parseAwbsParam(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

/** Load up to 25 orders for batch print (current generated list page or explicit AWBs). */
export async function buildBatchPrintPayload({
  limit = 25,
  page = 1,
  search = '',
  awbs = [],
} = {}) {
  let entries = [];

  const explicit = parseAwbsParam(Array.isArray(awbs) ? awbs.join(',') : awbs);
  if (explicit.length) {
    const listed = listGeneratedOrders({ limit: 100, page: 1, search: '' });
    const byAwb = new Map(listed.orders.map((o) => [String(o.awb), o]));
    for (const awb of explicit.slice(0, 25)) {
      const row = byAwb.get(awb) || { awb, orderName: '', orderId: '' };
      entries.push(row);
    }
  } else {
    const listed = listGeneratedOrders({
      limit: Math.min(Math.max(1, Number(limit) || 25), 25),
      page: Math.max(1, Number(page) || 1),
      search,
    });
    entries = listed.orders;
  }

  const slips = [];
  const skipped = [];

  for (const entry of entries) {
    const awb = String(entry.awb || '');
    if (!awb) continue;

    const orderRef =
      (entry.orderName && entry.orderName !== '—' ? entry.orderName : '') ||
      (entry.orderId ? String(entry.orderId) : '');

    if (orderRef) {
      try {
        const order = await enrichOrderForPackingSlip(await getOrder(orderRef));
        slips.push({ order, awb, waybillMeta: {} });
        continue;
      } catch (err) {
        skipped.push({ awb, orderName: entry.orderName, reason: err.message });
      }
    }

    const cached = loadSlipFrameFromDisk(awb);
    if (cached) {
      slips.push({ awb, cachedHtml: cached });
      continue;
    }

    skipped.push({
      awb,
      orderName: entry.orderName,
      reason: orderRef ? 'Shopify order unavailable' : 'No order # on file — open single slip once',
    });
  }

  return {
    count: slips.length,
    skipped,
    html: slips.length ? buildBatchPackingSlipPrintHtml(slips) : null,
  };
}

/** Use saved packing-slip HTML body when Shopify is unreachable. */
function loadSlipFrameFromDisk(awb) {
  const slipPath = resolve(labelsDir, `${awb}-packing-slip.html`);
  if (!existsSync(slipPath)) return null;
  try {
    const html = readFileSync(slipPath, 'utf8');
    const m = html.match(/<div class="slip-frame">[\s\S]*?<\/div>\s*<\/div>/i);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}
