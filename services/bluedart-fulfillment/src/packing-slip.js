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

function clusterCode(waybillMeta = {}) {
  return (
    waybillMeta.ClusterCode ||
    waybillMeta.DestinationArea ||
    waybillMeta.DestinationAreaCode ||
    'N/A'
  );
}

function routingCode(waybillMeta = {}) {
  const loc =
    waybillMeta.DestinationLocation ||
    waybillMeta.destinationLocation ||
    waybillMeta.DestinationArea ||
    '';
  const cluster = clusterCode(waybillMeta);
  if (loc && cluster && loc !== cluster) return `${loc}/${cluster}`;
  return loc || cluster || 'N/A';
}

function invoiceDateIso(order) {
  const raw = order.created_at || order.processed_at || '';
  if (!raw) return new Date().toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

function plainPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits || '—';
}

function lineIgst(item) {
  const tax = (item.tax_lines || []).reduce((sum, t) => sum + Number(t.price || 0), 0);
  return tax > 0 ? tax.toFixed(2) : '';
}

function lineTaxable(item) {
  const unit = Number(item.pre_tax_price ?? item.price ?? 0);
  return (unit * (item.quantity || 1)).toFixed(2);
}

function lineTotal(item) {
  const taxable = Number(lineTaxable(item));
  const tax = (item.tax_lines || []).reduce((sum, t) => sum + Number(t.price || 0), 0);
  return (taxable + tax).toFixed(2);
}

function productTableRows(order) {
  const items = (order.line_items || []).slice(0, 3);
  if (!items.length) {
    return `<tr><td colspan="7" class="prod-empty">—</td></tr>`;
  }
  return items
    .map((item) => {
      const sku = item.sku ? `<br><span class="sku">SKU: ${esc(item.sku)}</span>` : '';
      const title = esc(item.title || 'N/A');
      return `<tr>
        <td class="prod-name">${title}${sku}</td>
        <td>${esc(item.harmonized_system_code || 'N/A')}</td>
        <td class="c">${item.quantity || 1}</td>
        <td class="r">${Number(item.price || 0).toFixed(2)}</td>
        <td class="r">${lineTaxable(item)}</td>
        <td class="r">${lineIgst(item)}</td>
        <td class="r">${lineTotal(item)}</td>
      </tr>`;
    })
    .join('');
}

/** 4×6 inch portrait — standard e-commerce packing slip (Shiprocket-style) */
export function buildPackingSlipHtml(order, awb, waybillMeta = {}) {
  const ship = order.shipping_address || {};
  const { bluedart, packingSlip } = config;
  const weightKg = orderWeightKg(order);
  const isCod = isCodOrder(order);
  const pageW = packingSlip.pageWidth;
  const pageH = packingSlip.pageHeight;
  const printW = `${packingSlip.printWidthMm}mm`;
  const printH = `${packingSlip.printHeightMm}mm`;
  const marginH = `${packingSlip.printMarginHorizontalMm}mm`;

  const shipToName = ship.name || `${ship.first_name || ''} ${ship.last_name || ''}`.trim();
  const orderNum = String(order.name || '').replace('#', '');
  const route = routingCode(waybillMeta);
  const cluster = clusterCode(waybillMeta);
  const supportPh = packingSlip.supportPhone || bluedart.shipper.mobile;
  const codAmt = Number(order.total_price || 0).toFixed(2);
  const shipperLines = [
    bluedart.shipper.name,
    bluedart.shipper.address1,
    bluedart.shipper.address2,
    bluedart.shipper.address3,
    bluedart.shipper.pincode,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${packingSlip.printWidthMm}, height=${packingSlip.printHeightMm}" />
  <title>Packing slip ${esc(order.name)} — ${esc(awb)}</title>
  <style>
    @page {
      size: ${printW} ${printH} portrait;
      size: ${pageW} ${pageH} portrait;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${printW};
      height: ${printH};
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      padding: 1mm ${marginH};
      font-family: Arial, Helvetica, sans-serif;
      font-size: 5pt;
      line-height: 1.15;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 100%;
      height: 100%;
      border: 1px solid #000;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .sheet td, .sheet th {
      border: 1px solid #000;
      vertical-align: top;
      padding: 2px 3px;
      overflow: hidden;
    }
    .lbl {
      font-size: 4.5pt;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 1px;
    }
    .addr { font-size: 5pt; line-height: 1.12; word-wrap: break-word; }
    .brand {
      text-align: right;
      vertical-align: top;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 14pt;
      font-weight: 400;
      padding-top: 4px;
      padding-right: 4px;
    }
    .meta { font-size: 5pt; line-height: 1.25; }
    .meta div { margin-bottom: 1px; }
    .meta b { font-weight: 700; }
    .meta .cod-amt { font-size: 6pt; font-weight: 800; }
    .carrier {
      text-align: center;
      vertical-align: top;
      padding: 2px 3px;
    }
    .carrier-name {
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .barcode-wrap { text-align: center; padding: 1px 0; }
    .barcode-wrap svg { width: 100%; height: 16px; }
    .awb-num { text-align: center; font-size: 7pt; font-weight: 700; }
    .route { text-align: center; font-size: 4.5pt; font-weight: 700; margin-top: 1px; }
    .order-side { font-size: 5pt; line-height: 1.2; }
    .order-side div { margin-bottom: 1px; }
    .order-barcode svg { width: 100%; height: 14px; margin: 2px 0; }
    .prod-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 4pt; }
    .prod-table th {
      background: #f0f0f0;
      font-weight: 700;
      text-align: center;
      padding: 1px 2px;
      border: 1px solid #000;
      line-height: 1.1;
    }
    .prod-table td {
      border: 1px solid #000;
      padding: 1px 2px;
      vertical-align: top;
      line-height: 1.1;
    }
    .prod-name { word-wrap: break-word; overflow-wrap: anywhere; }
    .sku { font-size: 3.5pt; color: #333; }
    .c { text-align: center; }
    .r { text-align: right; }
    .prod-empty { text-align: center; padding: 4px; }
    .legal {
      font-size: 3.5pt;
      line-height: 1.15;
      padding: 2px 3px;
      text-align: center;
    }
    .service-bar {
      text-align: center;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 3px 4px;
      border-top: 1px solid #000;
    }
    @media screen {
      html { background: #e8e8e8; }
      body { margin: 8px auto; box-shadow: 0 0 6px rgba(0,0,0,.2); }
    }
    @media print {
      html, body {
        width: ${printW} !important;
        height: ${printH} !important;
        margin: 0 !important;
        padding: 1mm ${marginH} !important;
        overflow: hidden !important;
      }
      .sheet { width: 100% !important; height: 100% !important; }
    }
  </style>
</head>
<body>
  <table class="sheet" cellspacing="0" cellpadding="0">
    <colgroup><col style="width:58%" /><col style="width:42%" /></colgroup>

    <tr style="height:21%">
      <td>
        <div class="lbl">Ship To</div>
        <div class="addr"><strong>${esc(shipToName)}</strong><br>
        ${esc(ship.address1 || '')}${ship.address2 ? `<br>${esc(ship.address2)}` : ''}<br>
        ${esc(ship.city || '')}<br>
        ${esc([ship.province, ship.country || 'India'].filter(Boolean).join(', '))}${ship.zip ? `, ${esc(ship.zip)}` : ''}</div>
      </td>
      <td class="brand">${esc(packingSlip.logoText)}</td>
    </tr>

    <tr style="height:24%">
      <td class="meta">
        <div><b>Dimensions:</b> ${esc(packingSlip.dimensions)}</div>
        <div><b>Payment:</b> ${isCod ? 'COD' : 'Prepaid'}</div>
        ${isCod ? `<div><b>COD Amount:</b> <span class="cod-amt">${esc(codAmt)} INR</span></div>` : ''}
        <div><b>Weight:</b> ${weightKg} kg</div>
        <div><b>eWaybill No.:</b> N/A</div>
        <div><b>Cluster Code:</b> ${esc(cluster)}</div>
      </td>
      <td class="carrier">
        <div class="carrier-name">BLUEDART</div>
        <div class="barcode-wrap"><svg id="awb-barcode"></svg></div>
        <div class="awb-num">${esc(awb)}</div>
        <div class="route">Routing Code: ${esc(route)}</div>
      </td>
    </tr>

    <tr style="height:22%">
      <td>
        <div class="lbl">Shipped By (If undelivered, return to this address)</div>
        <div class="addr">${shipperLines.map((l) => esc(l)).join('<br>')}
        ${bluedart.shipper.gstin ? `<br>GSTIN: ${esc(bluedart.shipper.gstin)}` : ''}
        <br>Phone No.: ${esc(plainPhone(supportPh))}</div>
      </td>
      <td class="order-side">
        <div><b>Order #:</b> ${esc(orderNum)}</div>
        <div class="order-barcode"><svg id="order-barcode"></svg></div>
        <div><b>Invoice No.:</b> ${esc(invoiceNo(order))}</div>
        <div><b>Invoice Date:</b> ${esc(invoiceDateIso(order))}</div>
      </td>
    </tr>

    <tr style="height:22%">
      <td colspan="2" style="padding:0">
        <table class="prod-table" cellspacing="0" cellpadding="0">
          <colgroup>
            <col style="width:28%" /><col style="width:10%" /><col style="width:7%" />
            <col style="width:12%" /><col style="width:14%" /><col style="width:10%" /><col style="width:12%" />
          </colgroup>
          <tr>
            <th>Product Name &amp; SKU</th>
            <th>HSN</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Taxable Value</th>
            <th>IGST</th>
            <th>Total</th>
          </tr>
          ${productTableRows(order)}
        </table>
      </td>
    </tr>

    <tr style="height:11%">
      <td colspan="2" style="padding:0;vertical-align:bottom">
        <div class="legal">${esc(packingSlip.legalNote)}</div>
        <div class="service-bar">${esc(packingSlip.serviceLabel)}</div>
      </td>
    </tr>
  </table>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, { format: "CODE128", width: 0.85, height: 16, displayValue: false, margin: 0 });
    JsBarcode("#order-barcode", ${JSON.stringify(String(orderNum))}, { format: "CODE128", width: 0.85, height: 14, displayValue: false, margin: 0 });
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
