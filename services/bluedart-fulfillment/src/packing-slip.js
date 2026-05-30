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

function paymentLabel(order) {
  return isCodOrder(order) ? 'COD' : 'Prepaid';
}

function codAmount(order) {
  if (!isCodOrder(order)) return '0.00';
  return Number(order.total_price || 0).toFixed(2);
}

function orderWeightKg(order) {
  const grams = (order.line_items || []).reduce(
    (sum, item) => sum + (item.grams || 200) * (item.quantity || 1),
    0
  );
  return Math.max(0.2, grams / 1000).toFixed(2);
}

function invoiceNo(order) {
  const num = String(order.name || order.id || '').replace('#', '');
  return `${config.packingSlip.invoicePrefix}-${num}`;
}

function invoiceDate(order) {
  const raw = order.created_at || order.processed_at || '';
  return raw.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function lineIgst(item) {
  const tax = (item.tax_lines || []).reduce((sum, t) => sum + Number(t.price || 0), 0);
  return tax > 0 ? tax.toFixed(2) : '';
}

function routingCode(waybillMeta = {}) {
  const loc = waybillMeta.DestinationLocation || waybillMeta.destinationLocation || '';
  const area =
    waybillMeta.DestinationArea ||
    waybillMeta.DestinationAreaCode ||
    waybillMeta.ClusterCode ||
    '';
  if (loc && area) return `${loc}/${area}`;
  return loc || area || 'N/A';
}

function clusterCode(waybillMeta = {}) {
  return (
    waybillMeta.ClusterCode ||
    waybillMeta.DestinationArea ||
    waybillMeta.DestinationAreaCode ||
    'N/A'
  );
}

function kvRow(label, value, { boldValue = false } = {}) {
  const valueHtml = boldValue ? `<strong>${value}</strong>` : value;
  return `<tr><td class="kv-label">${label}</td><td class="kv-value">${valueHtml}</td></tr>`;
}

function truncate(s, max = 42) {
  const t = String(s || '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** 4×6 inch portrait — compact courier bag / thermal slip */
export function buildPackingSlipHtml(order, awb, waybillMeta = {}) {
  const ship = order.shipping_address || {};
  const { bluedart, packingSlip } = config;
  const weightKg = orderWeightKg(order);
  const isCod = isCodOrder(order);
  const pageW = packingSlip.pageWidth;
  const pageH = packingSlip.pageHeight;

  const rows = (order.line_items || [])
    .map((item) => {
      const qty = item.quantity || 1;
      const unit = Number(item.price || 0);
      const taxable = unit * qty;
      const sku = item.sku || 'N/A';
      const hsn = item.harmonized_system_code || '—';
      return `
      <tr>
        <td>${esc(truncate(`${item.title} | SKU: ${sku}`, 36))}</td>
        <td>${esc(hsn)}</td>
        <td>${qty}</td>
        <td>${unit.toFixed(0)}</td>
        <td>${taxable.toFixed(0)}</td>
        <td>${lineIgst(item) || '—'}</td>
        <td>${taxable.toFixed(0)}</td>
      </tr>`;
    })
    .join('');

  const shipToName = ship.name || `${ship.first_name || ''} ${ship.last_name || ''}`.trim();
  const shipToAddr = [
    ship.address1,
    ship.address2,
    ship.city,
    ship.province,
    ship.country || 'India',
    ship.zip,
  ]
    .filter(Boolean)
    .join(', ');

  const returnAddr = [
    bluedart.shipper.address1,
    bluedart.shipper.address2,
    bluedart.shipper.address3,
    bluedart.shipper.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  const orderNum = String(order.name || '').replace('#', '');
  const serviceFooter = isCod ? `${packingSlip.serviceLabel} · COD` : packingSlip.serviceLabel;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Packing slip ${esc(order.name)} — ${esc(awb)}</title>
  <style>
    @page { size: ${pageW} ${pageH}; margin: 0.04in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 3.92in;
      max-height: 5.92in;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 6pt;
      line-height: 1.15;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet { border: 1px solid #000; }
    .row { display: flex; border-bottom: 1px solid #000; }
    .row:last-child { border-bottom: none; }
    .cell {
      padding: 2px 3px;
      border-right: 1px solid #000;
      vertical-align: top;
    }
    .cell:last-child { border-right: none; }
    .cell-half { width: 50%; }
    .cell-wide { width: 58%; }
    .cell-narrow { width: 42%; }
    .section-title {
      font-weight: 700;
      font-size: 6pt;
      margin-bottom: 1px;
    }
    .addr { font-size: 5.5pt; line-height: 1.12; }
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 28px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 11pt;
      font-weight: 400;
      letter-spacing: 0.3px;
    }
    .kv { width: 100%; border-collapse: collapse; }
    .kv td { padding: 0; vertical-align: top; font-size: 5.5pt; line-height: 1.2; }
    .kv-label { width: 42%; padding-right: 2px; white-space: nowrap; }
    .kv-value { width: 58%; }
    .carrier-head {
      text-align: center;
      font-weight: 700;
      font-size: 7.5pt;
      letter-spacing: 0.3px;
      margin-bottom: 1px;
    }
    .barcode-wrap { text-align: center; padding: 1px 0 0; }
    .barcode-wrap svg { max-width: 100%; height: 22px; }
    .barcode-wrap.order svg { height: 18px; }
    .awb-no {
      text-align: center;
      font-weight: 700;
      font-size: 7.5pt;
      letter-spacing: 0.2px;
      line-height: 1.1;
    }
    .routing {
      text-align: center;
      font-size: 5.5pt;
      line-height: 1.1;
    }
    .meta-line { font-size: 5.5pt; line-height: 1.15; }
    .items {
      width: 100%;
      border-collapse: collapse;
      border-top: 1px solid #000;
      font-size: 5pt;
      table-layout: fixed;
    }
    .items th, .items td {
      border: 1px solid #000;
      padding: 1px 2px;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
    }
    .items th { font-weight: 700; background: #fff; font-size: 4.5pt; }
    .items td:first-child { width: 28%; }
    .legal {
      border-top: 1px solid #000;
      padding: 2px 3px;
      font-size: 4.5pt;
      line-height: 1.15;
    }
    .service-band {
      border-top: 1px solid #000;
      text-align: center;
      font-weight: 700;
      font-size: 7pt;
      letter-spacing: 0.3px;
      padding: 2px 3px;
      background: #d9f0d9;
    }
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
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">Print packing slip (4×6 inch)</button>
    <p style="margin-top:8px;color:#666;font-size:12px">Printer: scale <strong>100%</strong>, paper <strong>4×6 in</strong> (101×152 mm) portrait</p>
  </div>

  <div class="sheet">
    <div class="row">
      <div class="cell cell-wide">
        <div class="section-title">Ship To</div>
        <strong>${esc(shipToName)}</strong><br>
        <span class="addr">${esc(truncate(shipToAddr, 120))}</span>
      </div>
      <div class="cell cell-narrow">
        <div class="brand">${esc(packingSlip.logoText)}</div>
      </div>
    </div>

    <div class="row">
      <div class="cell cell-half">
        <table class="kv">
          ${kvRow('Dimensions', esc(packingSlip.dimensions))}
          ${kvRow('Payment', paymentLabel(order))}
          ${kvRow('COD Amount', `${codAmount(order)} INR`, { boldValue: isCod })}
          ${kvRow('Weight', `${weightKg} kg`)}
          ${kvRow('eWaybill No.', 'N/A')}
          ${kvRow('Cluster Code', esc(clusterCode(waybillMeta)))}
        </table>
      </div>
      <div class="cell cell-half">
        <div class="carrier-head">BLUEDART</div>
        <div class="barcode-wrap"><svg id="awb-barcode"></svg></div>
        <div class="awb-no">${esc(awb)}</div>
        <div class="routing">Routing Code: ${esc(routingCode(waybillMeta))}</div>
      </div>
    </div>

    <div class="row">
      <div class="cell cell-half">
        <div class="section-title">Shipped By (return if undelivered)</div>
        <span class="addr"><strong>${esc(bluedart.shipper.name)}</strong><br>
        ${esc(truncate(returnAddr, 80))}<br>
        ${bluedart.shipper.gstin ? `GSTIN: ${esc(bluedart.shipper.gstin)} · ` : ''}Ph: ${esc(bluedart.shipper.mobile)}</span>
      </div>
      <div class="cell cell-half">
        <div class="section-title">Order # ${esc(orderNum)}</div>
        <div class="barcode-wrap order"><svg id="order-barcode"></svg></div>
        <div class="meta-line">Inv: ${esc(invoiceNo(order))} · ${esc(invoiceDate(order))}</div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Product Name &amp; SKU</th>
          <th>HSN</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Taxable Value</th>
          <th>IGST</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="7">—</td></tr>'}</tbody>
    </table>

    <div class="legal">
      Disputes: Gujarat jurisdiction. Returns per store policy.
    </div>
    <div class="service-band">${esc(serviceFooter)}</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, { format: "CODE128", width: 1, height: 22, displayValue: false, margin: 0 });
    JsBarcode("#order-barcode", ${JSON.stringify(orderNum)}, { format: "CODE128", width: 1, height: 18, displayValue: false, margin: 0 });
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

export function savePackingSlip(order, awb, waybillMeta = {}) {
  const html = buildPackingSlipHtml(order, awb, waybillMeta);
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
