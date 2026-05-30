import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { labelsDir } from './paths.js';
import { trackingUrl } from './bluedart.js';

const manifestPath = resolve(labelsDir, 'generated-orders.json');

function readManifest() {
  if (!existsSync(manifestPath)) return { orders: [] };
  try {
    const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return Array.isArray(data.orders) ? data : { orders: [] };
  } catch {
    return { orders: [] };
  }
}

function writeManifest(data) {
  writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf8');
}

function orderNameSortKey(name = '') {
  const n = parseInt(String(name).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function toPrintUrls(awb, orderName) {
  const orderQuery = orderName ? `?order=${encodeURIComponent(orderName)}` : '';
  return {
    awb: String(awb),
    packingSlipUrl: `/api/packing-slip/${awb}${orderQuery}`,
    labelPrintUrl: `/api/print-label/${awb}`,
    labelPdfUrl: `/api/labels/${awb}.pdf`,
    trackingUrl: trackingUrl(awb),
  };
}

function parseOrderNameFromSlip(awb) {
  const slipPath = resolve(labelsDir, `${awb}-packing-slip.html`);
  if (!existsSync(slipPath)) return '';
  try {
    const html = readFileSync(slipPath, 'utf8');
    const m =
      html.match(/Order #\s*(\d+)/i) ||
      html.match(/Invoice No\.:\s*GH-(\d+)/i) ||
      html.match(/<strong>#(\d+)<\/strong>/);
    return m ? `#${m[1]}` : '';
  } catch {
    return '';
  }
}

function hasLabelPdf(awb) {
  return existsSync(resolve(labelsDir, `${awb}.pdf`));
}

function hasPackingSlip(awb) {
  return existsSync(resolve(labelsDir, `${awb}-packing-slip.html`));
}

/** Scan labels folder and merge AWBs missing from manifest (e.g. after redeploy). */
export function syncGeneratedFromDisk() {
  const manifest = readManifest();
  const known = new Set(manifest.orders.map((o) => o.awb));
  let added = 0;

  for (const file of readdirSync(labelsDir)) {
    const pdfMatch = file.match(/^(\d+)\.pdf$/);
    if (!pdfMatch) continue;
    const awb = pdfMatch[1];
    if (known.has(awb)) continue;

    const orderName = parseOrderNameFromSlip(awb);
    manifest.orders.push({
      awb,
      orderId: '',
      orderName: orderName || '—',
      customer: '',
      total: '',
      createdAt: new Date().toISOString(),
      labelSaved: true,
      syncedFromDisk: true,
    });
    known.add(awb);
    added += 1;
  }

  if (added > 0) {
    manifest.orders.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    writeManifest(manifest);
  }

  return added;
}

export function recordGeneratedOrder({
  orderId,
  orderName,
  awb,
  customer = '',
  total = '',
  labelSaved = true,
}) {
  const manifest = readManifest();
  const entry = {
    awb: String(awb),
    orderId: String(orderId || ''),
    orderName: orderName || '',
    customer,
    total: total != null ? String(total) : '',
    createdAt: new Date().toISOString(),
    labelSaved: Boolean(labelSaved),
  };

  const idx = manifest.orders.findIndex((o) => o.awb === entry.awb);
  if (idx >= 0) manifest.orders[idx] = { ...manifest.orders[idx], ...entry };
  else manifest.orders.unshift(entry);

  manifest.orders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  writeManifest(manifest);
  return entry;
}

export function listGeneratedOrders({ limit = 25, page = 1, search = '' } = {}) {
  syncGeneratedFromDisk();

  const q = String(search || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '');

  const pageSize = Math.min(Math.max(1, Number(limit) || 25), 100);
  const pageNum = Math.max(1, Number(page) || 1);

  let orders = readManifest().orders.filter((o) => hasLabelPdf(o.awb) || hasPackingSlip(o.awb));

  if (q) {
    orders = orders.filter((o) => {
      const name = String(o.orderName || '').toLowerCase().replace(/^#/, '');
      const awb = String(o.awb || '');
      const customer = String(o.customer || '').toLowerCase();
      return name.includes(q) || awb.includes(q) || customer.includes(q);
    });
  }

  orders = [...orders].sort((a, b) => {
    const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (byDate !== 0) return byDate;
    return orderNameSortKey(b.orderName) - orderNameSortKey(a.orderName);
  });

  const total = orders.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(pageNum, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = orders.slice(start, start + pageSize);

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrevious: safePage > 1,
    orders: slice.map((o) => ({
      ...o,
      ...toPrintUrls(o.awb, o.orderName && o.orderName !== '—' ? o.orderName : ''),
      hasLabelPdf: hasLabelPdf(o.awb),
      hasPackingSlip: hasPackingSlip(o.awb),
    })),
  };
}
