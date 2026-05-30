import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { labelsDir } from './paths.js';
import { isCodOrder } from './map-order.js';
import { trackingUrl } from './bluedart.js';

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

function formatOrderDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return `+91 ${digits.slice(-10)}`;
  return digits ? `+91 ${digits}` : '+91 —';
}

function uniqueAddressParts(parts) {
  const seen = new Set();
  return parts.filter((p) => {
    const key = String(p || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productSummary(order) {
  const items = order.line_items || [];
  if (!items.length) return '—';
  const first = items[0].title || '—';
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} more`;
}

function productQty(order) {
  return (order.line_items || []).reduce((s, i) => s + (i.quantity || 1), 0);
}

/** 4×6 inch portrait — GROSYHUB branded packing slip */
export function buildPackingSlipHtml(order, awb, waybillMeta = {}) {
  const ship = order.shipping_address || {};
  const { bluedart, packingSlip } = config;
  const weightKg = orderWeightKg(order);
  const isCod = isCodOrder(order);
  const printW = `${packingSlip.printWidthMm}mm`;
  const printH = `${packingSlip.printHeightMm}mm`;
  const marginH = `${packingSlip.printMarginHorizontalMm}mm`;

  const shipToName = ship.name || `${ship.first_name || ''} ${ship.last_name || ''}`.trim();
  const customerPhone = formatPhone(ship.phone || order.phone);
  const shipAddr = uniqueAddressParts([
    ship.address1,
    ship.address2,
    ship.city,
    ship.province,
    ship.country || 'India',
    ship.zip,
  ]).join(', ');

  const returnAddr = uniqueAddressParts([
    bluedart.shipper.address1,
    bluedart.shipper.address2,
    bluedart.shipper.address3,
    `${bluedart.shipper.pincode}, India`,
  ]).join(', ');

  const orderNum = String(order.name || '').replace('#', '');
  const route = routingCode(waybillMeta);
  const trackUrl = trackingUrl(awb);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=64x64&margin=0&data=${encodeURIComponent(trackUrl)}`;
  const serviceFooter = isCod ? `${packingSlip.serviceLabel} - COD` : packingSlip.serviceLabel;
  const supportPh = packingSlip.supportPhone || bluedart.shipper.mobile;
  const payAmount = isCod ? `₹${Number(order.total_price || 0).toFixed(2)}` : '₹0.00';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${packingSlip.printWidthMm}, height=${packingSlip.printHeightMm}" />
  <title>Packing slip ${esc(order.name)} — ${esc(awb)}</title>
  <style>
    @page {
      size: ${printW} ${printH} portrait;
      size: ${packingSlip.pageWidth} ${packingSlip.pageHeight} portrait;
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
      line-height: 1.12;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 100%;
      height: 100%;
      border: 1.2px solid #000;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .sheet td {
      border: 1px solid #000;
      vertical-align: top;
      padding: 0;
      overflow: hidden;
    }
    .sec-h {
      background: #000;
      color: #fff;
      font-size: 4.5pt;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1.5px 4px;
      line-height: 1.15;
    }
    .sec-body { padding: 2px 4px; overflow: hidden; }
    .head-brand { padding: 3px 4px; vertical-align: middle; }
    .brand-name {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #b8860b;
      line-height: 1;
    }
    .brand-web {
      font-size: 5pt;
      color: #333;
      margin-top: 2px;
      border-top: 1px solid #ccc;
      padding-top: 2px;
    }
    .head-carrier { padding: 3px 4px; text-align: right; vertical-align: middle; }
    .carrier-partner { font-size: 4.5pt; font-weight: 600; }
    .carrier-name { font-size: 8pt; font-weight: 800; color: #0054a6; line-height: 1.05; }
    .carrier-name span { color: #2e8b57; }
    .carrier-sub { font-size: 5.5pt; font-weight: 700; margin-top: 1px; }
    .txt { font-size: 5pt; line-height: 1.12; word-wrap: break-word; overflow-wrap: anywhere; }
    .txt strong { font-size: 5.5pt; }
    .txt.clamp { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .awb-cell { text-align: center; vertical-align: top; }
    .awb-num { font-size: 8pt; font-weight: 800; padding: 2px 4px 0; }
    .barcode-wrap { padding: 1px 5px 0; }
    .barcode-wrap svg { width: 100%; height: 17px; }
    .route { font-size: 4.5pt; font-weight: 700; padding: 2px 4px 3px; text-transform: uppercase; }
    .kv { font-size: 5pt; line-height: 1.2; }
    .kv div + div { margin-top: 1px; }
    .qr-cell { text-align: center; vertical-align: middle; padding: 2px 4px; }
    .qr-cell img { width: 42px; height: 42px; display: block; margin: 0 auto 1px; }
    .qr-hint { font-size: 4pt; line-height: 1.1; color: #222; }
    .pay-cell { padding: 0; vertical-align: top; }
    .pay-body { text-align: center; padding: 3px 2px; }
    .pay-big { font-size: 12pt; font-weight: 800; letter-spacing: 1px; line-height: 1; margin: 3px 0; }
    .pay-amt-lbl {
      background: #000;
      color: #fff;
      font-size: 4.5pt;
      font-weight: 700;
      padding: 1.5px 4px;
      text-transform: uppercase;
    }
    .pay-amt { font-size: 8pt; font-weight: 800; padding: 2px 4px 3px; }
    .icons-h {
      text-align: center;
      font-size: 4.5pt;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 4px;
      border-bottom: 1px solid #000;
    }
    .icons {
      display: flex;
      justify-content: space-around;
      align-items: flex-start;
      padding: 3px 2px 4px;
      font-size: 4pt;
      font-weight: 700;
      text-align: center;
      line-height: 1.1;
    }
    .icons span { max-width: 32%; }
    .tear {
      border-top: 1px dashed #000;
      text-align: center;
      font-size: 4pt;
      font-weight: 700;
      padding: 1px 4px;
    }
    .footer-bar {
      background: #000;
      color: #fff;
      text-align: center;
      font-weight: 800;
      font-size: 6.5pt;
      padding: 2px 4px;
      letter-spacing: 0.3px;
    }
    .footer-thanks {
      text-align: center;
      font-size: 5pt;
      font-weight: 700;
      padding: 1px 4px;
    }
    .footer-contact {
      text-align: center;
      font-size: 4pt;
      padding: 1px 4px 2px;
      border-top: 1px solid #000;
      line-height: 1.2;
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
    <colgroup><col style="width:50%" /><col style="width:50%" /></colgroup>

    <tr style="height:8%">
      <td class="head-brand">
        <div class="brand-name">${esc(packingSlip.logoText.toUpperCase())}</div>
        <div class="brand-web">${esc(packingSlip.websiteUrl)}</div>
      </td>
      <td class="head-carrier">
        <div class="carrier-partner">Courier Partner</div>
        <div class="carrier-name">BLUE<span>DART</span></div>
        <div class="carrier-sub">${esc(packingSlip.serviceLabel)}</div>
      </td>
    </tr>

    <tr style="height:20%">
      <td>
        <div class="sec-h">Ship To</div>
        <div class="sec-body txt">
          <strong>${esc(shipToName)}</strong><br>
          ${esc(customerPhone)}<br>
          <span class="clamp">${esc(shipAddr)}</span>
        </div>
      </td>
      <td class="awb-cell">
        <div class="sec-h">AWB No.</div>
        <div class="awb-num">${esc(awb)}</div>
        <div class="barcode-wrap"><svg id="awb-barcode"></svg></div>
        <div class="route">Routing Code: ${esc(route)}</div>
      </td>
    </tr>

    <tr style="height:14%">
      <td>
        <div class="sec-h">Order Details</div>
        <div class="sec-body kv">
          <div><strong>Order ID:</strong> #${esc(orderNum)}</div>
          <div><strong>Invoice No.:</strong> ${esc(invoiceNo(order))}</div>
          <div><strong>Order Date:</strong> ${esc(formatOrderDate(order.created_at))}</div>
        </div>
      </td>
      <td class="qr-cell">
        <img src="${qrUrl}" alt="Track QR" width="42" height="42" />
        <div class="qr-hint">Track your shipment<br>Scan QR code or visit<br>www.bluedart.com</div>
      </td>
    </tr>

    <tr style="height:15%">
      <td>
        <div class="sec-h">Product Details</div>
        <div class="sec-body kv">
          <div><strong>Item:</strong> ${esc(productSummary(order))}</div>
          <div><strong>Qty:</strong> ${productQty(order)}</div>
          <div><strong>Weight:</strong> ${weightKg} KG</div>
          <div><strong>Dimensions:</strong> ${esc(packingSlip.dimensions)}</div>
        </div>
      </td>
      <td class="pay-cell">
        <div class="sec-h">Payment Mode</div>
        <div class="pay-body">
          <div class="pay-big">${isCod ? 'COD' : 'PREPAID'}</div>
          ${isCod ? `<div class="pay-amt-lbl">COD Amount</div><div class="pay-amt">${esc(payAmount)}</div>` : ''}
        </div>
      </td>
    </tr>

    <tr style="height:18%">
      <td>
        <div class="sec-h">Shipper / Return Address</div>
        <div class="sec-body txt">
          <strong>${esc(bluedart.shipper.name)}</strong><br>
          <span class="clamp">${esc(returnAddr)}</span><br>
          ${esc(formatPhone(supportPh))}
        </div>
      </td>
      <td style="padding:0">
        <div class="icons-h">Handle With Care</div>
        <div class="icons">
          <span>📦<br>Handle<br>With Care</span>
          <span>☔<br>Keep<br>Dry</span>
          <span>⬆<br>This<br>Side Up</span>
        </div>
      </td>
    </tr>

    <tr style="height:13%">
      <td colspan="2" style="padding:0;vertical-align:top;overflow:hidden">
        <div class="tear">✂ — DO NOT ACCEPT IF SEAL IS BROKEN — ✂</div>
        <div class="footer-bar">${esc(serviceFooter)}</div>
        <div class="footer-thanks">THANK YOU FOR SHOPPING WITH ${esc(packingSlip.logoText.toUpperCase())}!</div>
        <div class="footer-contact">
          📞 ${esc(formatPhone(supportPh))} &nbsp;|&nbsp; ✉ ${esc(packingSlip.supportEmail)} &nbsp;|&nbsp; 🌐 ${esc(packingSlip.websiteUrl)}
        </div>
      </td>
    </tr>
  </table>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, { format: "CODE128", width: 0.85, height: 17, displayValue: false, margin: 0 });
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
