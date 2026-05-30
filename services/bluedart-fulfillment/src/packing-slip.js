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

function truncate(s, max = 42) {
  const t = String(s || '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
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
  const first = truncate(items[0].title, 38);
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} more`;
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
      margin: 0 ${marginH};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { width: ${printW}; height: ${printH}; }
    body {
      width: ${printW};
      height: ${printH};
      margin: 0;
      padding: 0 ${marginH};
      overflow: hidden;
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
      border: 1.5px solid #000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .row { display: flex; border-bottom: 1px solid #000; min-height: 0; }
    .col {
      flex: 1;
      padding: 2px 4px;
      border-right: 1px solid #000;
      vertical-align: top;
    }
    .col:last-child { border-right: none; }
    .head {
      align-items: center;
      padding: 3px 4px;
    }
    .brand-name {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #b8860b;
      line-height: 1;
    }
    .brand-web { font-size: 5pt; color: #333; margin-top: 1px; }
    .carrier-box { text-align: right; line-height: 1.1; }
    .carrier-name {
      font-size: 8pt;
      font-weight: 800;
      color: #0054a6;
      letter-spacing: 0.3px;
    }
    .carrier-name span { color: #2e8b57; }
    .carrier-sub { font-size: 5.5pt; font-weight: 700; }
    .lbl {
      font-size: 5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      margin-bottom: 1px;
    }
    .txt { font-size: 5.5pt; line-height: 1.12; }
    .txt strong { font-size: 6pt; }
    .barcode-wrap { text-align: center; padding: 1px 0; }
    .barcode-wrap svg { max-width: 100%; height: 20px; }
    .awb-num { text-align: center; font-weight: 800; font-size: 7pt; }
    .route { text-align: center; font-size: 5pt; font-weight: 700; }
    .qr-wrap { text-align: center; padding: 2px 0; }
    .qr-wrap img { width: 52px; height: 52px; }
    .qr-hint { font-size: 4.5pt; text-align: center; line-height: 1.1; color: #333; }
    .kv { font-size: 5.5pt; line-height: 1.2; }
    .kv div { margin-bottom: 1px; }
    .cod-box {
      background: #000;
      color: #fff;
      text-align: center;
      padding: 4px 3px;
      margin: 2px 0;
      height: calc(100% - 4px);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .cod-box .big { font-size: 11pt; font-weight: 800; letter-spacing: 1px; }
    .cod-box .amt { font-size: 8pt; font-weight: 700; margin-top: 2px; }
    .icons {
      display: flex;
      justify-content: space-around;
      align-items: center;
      font-size: 5pt;
      font-weight: 700;
      text-align: center;
      padding: 4px 2px;
      height: 100%;
    }
    .icons span { max-width: 30%; line-height: 1.1; }
    .tear {
      border-top: 1px dashed #000;
      text-align: center;
      font-size: 4.5pt;
      font-weight: 700;
      padding: 2px 4px;
      letter-spacing: 0.2px;
    }
    .footer-bar {
      background: #000;
      color: #fff;
      text-align: center;
      font-weight: 800;
      font-size: 6.5pt;
      padding: 3px 4px;
      letter-spacing: 0.3px;
    }
    .footer-thanks {
      text-align: center;
      font-size: 5.5pt;
      font-weight: 700;
      padding: 2px 4px;
    }
    .footer-contact {
      text-align: center;
      font-size: 4.5pt;
      padding: 2px 4px 3px;
      border-top: 1px solid #000;
      line-height: 1.25;
    }
    @media screen {
      html { margin: 0 auto; }
      body { margin: 12px auto; box-shadow: 0 0 8px rgba(0,0,0,.15); }
      .no-print { display: block; text-align: center; margin: 12px; max-width: 520px; }
    }
    @media print {
      html, body {
        width: ${printW} !important;
        height: ${printH} !important;
        margin: 0 !important;
        padding: 0 ${marginH} !important;
      }
      .sheet { width: 100% !important; height: 100% !important; border: 1.5px solid #000; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">Print packing slip (4×6 inch)</button>
    <p style="margin-top:8px;color:#333;font-size:12px;line-height:1.5">
      Paper: <strong>4 × 6 inch</strong> (101.6 × 152.4 mm) · Portrait · Scale <strong>100%</strong>
    </p>
  </div>

  <div class="sheet">
    <div class="row head">
      <div class="col">
        <div class="brand-name">${esc(packingSlip.logoText.toUpperCase())}</div>
        <div class="brand-web">${esc(packingSlip.websiteUrl)}</div>
      </div>
      <div class="col carrier-box">
        <div class="carrier-name">BLUE<span>DART</span></div>
        <div class="carrier-sub">${esc(packingSlip.serviceLabel)}</div>
      </div>
    </div>

    <div class="row">
      <div class="col">
        <div class="lbl">Ship To</div>
        <div class="txt"><strong>${esc(shipToName)}</strong><br>
        ${esc(formatPhone(ship.phone || order.phone))}<br>
        ${esc(truncate(shipToAddr, 95))}</div>
      </div>
      <div class="col">
        <div class="lbl">AWB No.</div>
        <div class="barcode-wrap"><svg id="awb-barcode"></svg></div>
        <div class="awb-num">${esc(awb)}</div>
        <div class="route">Routing Code: ${esc(route)}</div>
      </div>
    </div>

    <div class="row">
      <div class="col">
        <div class="lbl">Order Details</div>
        <div class="kv">
          <div><strong>Order ID:</strong> #${esc(orderNum)}</div>
          <div><strong>Invoice No.:</strong> ${esc(invoiceNo(order))}</div>
          <div><strong>Order Date:</strong> ${esc(formatOrderDate(order.created_at))}</div>
        </div>
      </div>
      <div class="col">
        <div class="qr-wrap"><img src="${qrUrl}" alt="Track QR" width="52" height="52" /></div>
        <div class="qr-hint">Scan QR code or visit<br>www.bluedart.com</div>
      </div>
    </div>

    <div class="row">
      <div class="col">
        <div class="lbl">Product Details</div>
        <div class="kv">
          <div><strong>Item:</strong> ${esc(productSummary(order))}</div>
          <div><strong>Qty:</strong> ${productQty(order)}</div>
          <div><strong>Weight:</strong> ${weightKg} KG</div>
        </div>
      </div>
      <div class="col">
        <div class="lbl">Payment Mode</div>
        <div class="cod-box">
          <div class="big">${isCod ? 'COD' : 'PREPAID'}</div>
          ${isCod ? `<div class="amt">COD AMOUNT<br>${esc(payAmount)}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="row" style="flex:1">
      <div class="col">
        <div class="lbl">Shipper / Return Address</div>
        <div class="txt"><strong>${esc(bluedart.shipper.name)}</strong><br>
        ${esc(truncate(returnAddr, 72))}<br>
        Ph: ${esc(supportPh)}</div>
      </div>
      <div class="col">
        <div class="icons">
          <span>📦<br>Handle<br>With Care</span>
          <span>☔<br>Keep<br>Dry</span>
          <span>⬆<br>This<br>Side Up</span>
        </div>
      </div>
    </div>

    <div class="tear">✂ — DO NOT ACCEPT IF SEAL IS BROKEN — ✂</div>
    <div class="footer-bar">${esc(serviceFooter)}</div>
    <div class="footer-thanks">THANK YOU FOR SHOPPING WITH ${esc(packingSlip.logoText.toUpperCase())}!</div>
    <div class="footer-contact">
      📞 ${esc(formatPhone(supportPh))} &nbsp;|&nbsp; ✉ ${esc(packingSlip.supportEmail)} &nbsp;|&nbsp; 🌐 ${esc(packingSlip.websiteUrl)}
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, { format: "CODE128", width: 0.95, height: 20, displayValue: false, margin: 0 });
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
