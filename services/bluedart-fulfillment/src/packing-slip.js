import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { labelsDir } from './paths.js';
import { isCodOrder } from './map-order.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return d || '—';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function paymentLabel(order) {
  return isCodOrder(order) ? 'COD' : 'Prepaid';
}

function codAmount(order) {
  if (!isCodOrder(order)) return '0.00';
  return Number(order.total_price || 0).toFixed(2);
}

/** 4×8 inch portrait — matches common courier bag slip (reference layout) */
export function buildPackingSlipHtml(order, awb) {
  const ship = order.shipping_address || {};
  const bill = order.billing_address || ship;
  const { bluedart } = config;
  const weightKg = Math.max(
    0.2,
    (order.line_items || []).reduce((s, i) => s + (i.grams || 200) * (i.quantity || 1), 0) / 1000
  ).toFixed(2);

  const rows = (order.line_items || [])
    .map(
      (item) => `
      <tr>
        <td>${esc(item.title)}<br><small>SKU: ${esc(item.sku || 'N/A')}</small></td>
        <td>—</td>
        <td>${item.quantity}</td>
        <td>${Number(item.price).toFixed(2)}</td>
        <td>${(Number(item.price) * item.quantity).toFixed(2)}</td>
        <td>${(Number(item.price) * item.quantity).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  const shipToName = ship.name || `${ship.first_name || ''} ${ship.last_name || ''}`.trim();
  const shipToAddr = [ship.address1, ship.address2, ship.city, ship.province, ship.zip, ship.country]
    .filter(Boolean)
    .join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Packing slip ${esc(order.name)} — ${esc(awb)}</title>
  <style>
    @page { size: 4in 8in; margin: 0.08in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 3.84in;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7.5pt;
      line-height: 1.25;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .block { border: 1px solid #000; padding: 4px 5px; }
    .row { display: flex; border: 1px solid #000; border-top: none; }
    .row:first-of-type { border-top: 1px solid #000; }
    .col { flex: 1; padding: 4px 5px; border-right: 1px solid #000; }
    .col:last-child { border-right: none; }
    .head { font-weight: 700; font-size: 8pt; margin-bottom: 2px; }
    .logo { font-size: 14pt; font-weight: 700; text-align: center; letter-spacing: 1px; }
    .meta td, .meta th { border: 1px solid #000; padding: 2px 3px; font-size: 7pt; }
    .meta { width: 100%; border-collapse: collapse; margin-top: 2px; }
    .barcode-wrap { text-align: center; padding: 4px 0; }
    .barcode-wrap svg { max-width: 100%; height: 36px; }
    .service {
      text-align: center; font-weight: 700; font-size: 9pt;
      padding: 5px; border: 1px solid #000; border-top: none;
      background: #e8f5e9;
    }
    .legal { font-size: 6pt; padding: 4px 5px; border: 1px solid #000; border-top: none; }
    @media screen {
      body { margin: 12px auto; box-shadow: 0 0 8px rgba(0,0,0,.15); }
      .no-print { display: block; text-align: center; margin: 12px; }
    }
    @media print {
      .no-print { display: none !important; }
      body { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">Print packing slip (4×8 inch)</button>
    <p style="margin-top:8px;color:#666;font-size:12px">Printer: set scale <strong>100%</strong>, paper <strong>4×8 in</strong> or custom 101×203 mm</p>
  </div>

  <div class="row">
    <div class="col" style="flex:1.2">
      <div class="head">Ship To</div>
      <strong>${esc(shipToName)}</strong><br>
      ${esc(shipToAddr)}<br>
      Pincode: ${esc(ship.zip)}
    </div>
    <div class="col" style="flex:0.5;display:flex;align-items:center;justify-content:center">
      <div class="logo">GROSYHUB</div>
    </div>
  </div>

  <div class="row">
    <div class="col">
      <table class="meta">
        <tr><td><strong>Weight</strong></td><td>${weightKg} kg</td></tr>
        <tr><td><strong>Payment</strong></td><td>${paymentLabel(order)}</td></tr>
        <tr><td><strong>COD Amount</strong></td><td><strong>${codAmount(order)} INR</strong></td></tr>
        <tr><td><strong>Order</strong></td><td>${esc(order.name)}</td></tr>
      </table>
    </div>
    <div class="col">
      <div class="head" style="text-align:center">BLUEDART</div>
      <div class="barcode-wrap"><svg id="awb-barcode"></svg></div>
      <div style="text-align:center;font-weight:700;font-size:9pt">${esc(awb)}</div>
      <div style="text-align:center;font-size:7pt;margin-top:2px">DART APEX · Prepaid</div>
    </div>
  </div>

  <div class="row">
    <div class="col">
      <div class="head">Shipped By (If undelivered, return to)</div>
      <strong>${esc(bluedart.shipper.name)}</strong><br>
      ${esc(bluedart.shipper.address1)}, ${esc(bluedart.shipper.address2)}<br>
      ${esc(bluedart.shipper.address3)} · ${esc(bluedart.shipper.pincode)}<br>
      Tel: ${esc(bluedart.shipper.mobile)}
    </div>
    <div class="col">
      <div class="head">Order #</div>
      <div class="barcode-wrap"><svg id="order-barcode"></svg></div>
      <div style="text-align:center">${esc(order.name)}</div>
      <div style="margin-top:4px;font-size:7pt">Date: ${esc((order.created_at || '').slice(0, 10))}</div>
    </div>
  </div>

  <table class="meta" style="border-top:none">
    <thead>
      <tr>
        <th>Product &amp; SKU</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Taxable</th><th>Total</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">—</td></tr>'}</tbody>
  </table>

  <div class="legal">
    All disputes subject to Gujarat jurisdiction. Goods once sold will only be taken back or exchanged as per store return policy.
  </div>
  <div class="service">DART APEX · Blue Dart Express</div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, { format: "CODE128", width: 1.2, height: 34, displayValue: false, margin: 0 });
    JsBarcode("#order-barcode", ${JSON.stringify(String(order.name || '').replace('#', ''))}, { format: "CODE128", width: 1.2, height: 28, displayValue: false, margin: 0 });
  <\/script>
</body>
</html>`;
}

/** 4×6 inch landscape — Blue Dart courier label print wrapper */
export function buildLabelPrintHtml(awb) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Blue Dart label ${esc(awb)}</title>
  <style>
    @page { size: 6in 4in landscape; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 6in; height: 4in; overflow: hidden; background: #fff; }
    iframe, embed {
      width: 6in;
      height: 4in;
      border: 0;
      display: block;
    }
    .no-print {
      position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
      z-index: 9; background: #fff; padding: 8px 12px; border: 1px solid #ccc;
      font-family: system-ui, sans-serif; font-size: 13px;
    }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Print label (4×6 inch)</button>
    <p style="margin-top:6px;color:#555">Scale: <strong>100%</strong> · Paper: <strong>4×6 in</strong> (100×150 mm) landscape</p>
  </div>
  <embed src="/api/labels/${esc(awb)}.pdf#toolbar=0&navpanes=0" type="application/pdf" />
</body>
</html>`;
}

export function savePackingSlip(order, awb) {
  const html = buildPackingSlipHtml(order, awb);
  const slipPath = resolve(labelsDir, `${awb}-packing-slip.html`);
  writeFileSync(slipPath, html, 'utf8');
  return slipPath;
}

export function saveLabelPrintPage(awb) {
  const html = buildLabelPrintHtml(awb);
  const printPath = resolve(labelsDir, `${awb}-print-label.html`);
  writeFileSync(printPath, html, 'utf8');
  return printPath;
}
