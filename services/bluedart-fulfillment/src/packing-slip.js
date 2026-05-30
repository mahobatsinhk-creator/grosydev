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

function productSummary(order) {
  const items = order.line_items || [];
  if (!items.length) return '—';
  const first = items[0].title || '—';
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} more`;
}

function addressLines(parts) {
  return parts.filter(Boolean).join(', ');
}

function productQty(order) {
  return (order.line_items || []).reduce((s, i) => s + (i.quantity || 1), 0);
}

/** 4×6 inch portrait — Grosyhub branded bag label (reference layout) */
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
  const shipToAddr = addressLines([
    ship.address1,
    ship.address2,
    ship.city,
    ship.province,
    ship.country || 'India',
    ship.zip,
  ]);

  const returnAddr = addressLines([
    bluedart.shipper.address1,
    bluedart.shipper.address2,
    bluedart.shipper.address3,
    `${bluedart.shipper.pincode}, India`,
  ]);

  const orderNum = String(order.name || '').replace('#', '');
  const route = clusterCode(waybillMeta);
  const trackUrl = trackingUrl(awb);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=72x72&margin=0&data=${encodeURIComponent(trackUrl)}`;
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
      font-size: 5.5pt;
      line-height: 1.15;
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
    .half { width: 50%; }
    .sec-h {
      background: #000;
      color: #fff;
      font-size: 5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 1.5px 4px;
      line-height: 1.2;
    }
    .sec-body { padding: 2px 3px; overflow: hidden; }
    .head-brand { padding: 2px 3px; vertical-align: middle; }
    .brand-name {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #b8860b;
      line-height: 1;
    }
    .brand-web {
      font-size: 5.5pt;
      color: #333;
      margin-top: 2px;
      border-top: 1px solid #ccc;
      padding-top: 2px;
    }
    .head-carrier { padding: 2px 3px; text-align: right; vertical-align: middle; }
    .carrier-partner { font-size: 5pt; font-weight: 600; }
    .carrier-name {
      font-size: 9pt;
      font-weight: 800;
      color: #0054a6;
      line-height: 1.05;
    }
    .carrier-name span { color: #2e8b57; }
    .carrier-sub { font-size: 6pt; font-weight: 700; margin-top: 1px; }
    .ship-name { font-size: 6.5pt; font-weight: 800; margin-bottom: 1px; }
    .ship-line {
      font-size: 5pt;
      line-height: 1.12;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .ship-line.clamp-3 {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .ship-line.clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .awb-cell { text-align: center; vertical-align: middle; }
    .awb-num {
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 2px 4px 0;
    }
    .barcode-wrap { padding: 1px 6px 0; }
    .barcode-wrap svg { width: 100%; max-width: 100%; height: 18px; }
    .route {
      font-size: 5pt;
      font-weight: 700;
      padding: 2px 4px 3px;
      text-transform: uppercase;
    }
    .kv { font-size: 5.5pt; line-height: 1.25; }
    .kv div + div { margin-top: 1px; }
    .qr-cell { text-align: center; vertical-align: middle; padding: 3px 4px; }
    .qr-cell img { width: 40px; height: 40px; display: block; margin: 0 auto 1px; }
    .qr-hint { font-size: 4pt; line-height: 1.1; color: #222; }
    .prod-item {
      font-size: 5pt;
      line-height: 1.12;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 2px;
    }
    .prod-meta {
      display: flex;
      justify-content: space-between;
      font-size: 5.5pt;
      font-weight: 700;
      margin-top: 2px;
    }
    .pay-cell { padding: 0; vertical-align: top; }
    .pay-body {
      text-align: center;
      padding: 2px 3px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: calc(100% - 14px);
    }
    .pay-big { font-size: 12pt; font-weight: 800; letter-spacing: 1px; line-height: 1; }
    .pay-amt-lbl {
      background: #000;
      color: #fff;
      font-size: 5pt;
      font-weight: 700;
      padding: 1.5px 4px;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .pay-amt { font-size: 8pt; font-weight: 800; padding: 2px 3px; }
    .icons-h {
      text-align: center;
      font-size: 4.5pt;
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 3px;
      border-bottom: 1px solid #000;
    }
    .icons {
      display: flex;
      justify-content: space-around;
      align-items: flex-start;
      padding: 2px 2px 3px;
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
      padding: 1px 3px;
      line-height: 1.1;
    }
    .footer-bar {
      background: #000;
      color: #fff;
      text-align: center;
      font-weight: 800;
      font-size: 6pt;
      padding: 2px 3px;
      letter-spacing: 0.3px;
    }
    .footer-thanks {
      text-align: center;
      font-size: 5pt;
      font-weight: 700;
      padding: 1px 3px;
      line-height: 1.1;
    }
    .footer-contact {
      text-align: center;
      font-size: 4pt;
      padding: 1px 3px 2px;
      border-top: 1px solid #000;
      line-height: 1.15;
    }
    @media screen {
      html { background: #e8e8e8; margin: 0 auto; }
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
    <colgroup>
      <col class="half" /><col class="half" />
    </colgroup>
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
        <div class="sec-body">
          <div class="ship-name">${esc(shipToName)}</div>
          <div class="ship-line">${esc(formatPhone(ship.phone || order.phone))}</div>
          <div class="ship-line clamp-3">${esc(shipToAddr)}</div>
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
        <img src="${qrUrl}" alt="Track QR" width="40" height="40" />
        <div class="qr-hint">Scan QR or visit<br>www.bluedart.com</div>
      </td>
    </tr>
    <tr style="height:14%">
      <td>
        <div class="sec-h">Product Details</div>
        <div class="sec-body">
          <div class="prod-item"><strong>Item:</strong> ${esc(productSummary(order))}</div>
          <div class="prod-meta">
            <span>Qty: ${productQty(order)}</span>
            <span>Weight: ${weightKg} KG</span>
          </div>
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
        <div class="sec-body">
          <div class="ship-name">${esc(bluedart.shipper.name)}</div>
          <div class="ship-line clamp-2">${esc(returnAddr)}</div>
          <div class="ship-line">${esc(formatPhone(supportPh))}</div>
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
    <tr style="height:12%">
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
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, { format: "CODE128", width: 0.9, height: 18, displayValue: false, margin: 0 });
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
