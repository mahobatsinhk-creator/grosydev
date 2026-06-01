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
  const items = order.line_items || [];
  const hasLocal = items.some((i) => i.packing_slip_weight_kg != null);
  if (hasLocal) {
    const kg = items.reduce(
      (sum, item) =>
        sum + Number(item.packing_slip_weight_kg || 0) * (item.quantity || 1),
      0
    );
    return Math.max(0.2, kg).toFixed(2);
  }
  const grams = items.reduce(
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

const SLIP_SUPPORT_PHONE = '8866559670';

function resolveSupportPhone(packingSlip, bluedart) {
  const raw = String(packingSlip.supportPhone || bluedart.shipper.mobile || '').trim();
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (!digits || digits === '9999999999' || digits === '0000000000') {
    return SLIP_SUPPORT_PHONE;
  }
  return digits;
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

/** Dimensions from Shopify metafields (custom.item_dimensions / custom.dimensions) */
function orderDimensions(order, fallback) {
  const items = order.line_items || [];
  const parts = items
    .map((item) => {
      const dim = item.packing_slip_dimensions;
      if (!dim) return null;
      if (items.length === 1) return dim;
      const name = (item.title || 'Item').slice(0, 28);
      return `${name}: ${dim}`;
    })
    .filter(Boolean);
  if (parts.length) return parts.join('; ');
  return fallback;
}

function buildSlipData(order, awb, waybillMeta = {}) {
  const ship = order.shipping_address || {};
  const { bluedart, packingSlip } = config;
  const qrPx = Math.min(Math.max(Number(packingSlip.qrPixelSize) || 140, 80), 256);
  return {
    awb: String(awb),
    order,
    waybillMeta,
    packingSlip,
    bluedart,
    weightKg: orderWeightKg(order),
    isCod: isCodOrder(order),
    pageW: packingSlip.pageWidth,
    pageH: packingSlip.pageHeight,
    marginHIn: `${(Number(packingSlip.printMarginHorizontalMm) / 25.4).toFixed(3)}in`,
    marginTopIn: `${(Number(packingSlip.printMarginTopMm) / 25.4).toFixed(3)}in`,
    marginBottomIn: '0',
    padTopMm: packingSlip.printMarginTopMm,
    padSideMm: packingSlip.printMarginHorizontalMm,
    innerHmm:
      Number(packingSlip.printHeightMm) - Number(packingSlip.printMarginTopMm),
    printWmm: packingSlip.printWidthMm,
    printHmm: packingSlip.printHeightMm,
    dimensionsText: orderDimensions(order, packingSlip.dimensions),
    qrPx,
    qrDisplayPx: 56,
    barcodeHeightPx: 54,
    barcodeBarWidth: 1.75,
    shipToName: ship.name || `${ship.first_name || ''} ${ship.last_name || ''}`.trim(),
    customerPhone: formatPhone(ship.phone || order.phone),
    shipAddr: uniqueAddressParts([
      ship.address1,
      ship.address2,
      ship.city,
      ship.province,
      ship.country || 'India',
      ship.zip,
    ]).join(', '),
    returnAddr: uniqueAddressParts([
      bluedart.shipper.address1,
      bluedart.shipper.address2,
      bluedart.shipper.address3,
      `${bluedart.shipper.pincode}, India`,
    ]).join(', '),
    orderNum: String(order.name || '').replace('#', ''),
    route: routingCode(waybillMeta),
    qrUrl: `/api/qr?size=${qrPx}&data=${encodeURIComponent(trackingUrl(awb))}`,
    serviceFooter: isCodOrder(order)
      ? `${packingSlip.serviceLabel} - COD`
      : packingSlip.serviceLabel,
    supportPh: resolveSupportPhone(packingSlip, bluedart),
    payAmount: isCodOrder(order) ? `₹${Number(order.total_price || 0).toFixed(2)}` : '₹0.00',
  };
}

function slipSheetCss(d) {
  return `
    @page {
      size: ${d.printWmm}mm ${d.printHmm}mm;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .slip-frame {
      width: 100%;
      height: ${d.innerHmm}mm;
      max-height: ${d.innerHmm}mm;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sheet {
      width: 100%;
      height: ${d.innerHmm}mm;
      max-height: ${d.innerHmm}mm;
      border: 1px solid #000;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: avoid;
      break-inside: avoid;
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
      font-size: 6.5pt;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 4px;
      line-height: 1.12;
    }
    .sec-body { padding: 2px 4px; overflow: hidden; }
    .head-brand { padding: 4px 4px 2px; vertical-align: middle; }
    .brand-name { font-size: 11pt; font-weight: 800; letter-spacing: 0.5px; color: #b8860b; line-height: 1; }
    .brand-web { font-size: 6.5pt; color: #333; margin-top: 2px; border-top: 1px solid #ccc; padding-top: 2px; }
    .head-carrier { padding: 3px 4px; text-align: right; vertical-align: middle; }
    .carrier-partner { font-size: 5.5pt; font-weight: 600; }
    .carrier-name { font-size: 9.5pt; font-weight: 800; color: #0054a6; line-height: 1.05; }
    .carrier-name span { color: #2e8b57; }
    .carrier-sub { font-size: 6.5pt; font-weight: 700; margin-top: 1px; }
    .txt { font-size: 7pt; line-height: 1.1; word-wrap: break-word; overflow-wrap: anywhere; }
    .txt strong { font-size: 7.5pt; }
    .txt.clamp { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .row-full { vertical-align: top; }
    .awb-cell, .awb-row { text-align: center; vertical-align: top; }
    .awb-num { font-size: 9pt; font-weight: 800; padding: 1px 4px 0; line-height: 1.1; }
    .barcode-wrap {
      padding: 2px 6px 0;
      text-align: center;
      line-height: 0;
      overflow: hidden;
      min-height: ${d.barcodeHeightPx + 2}px;
    }
    .barcode-wrap img,
    .barcode-wrap svg {
      width: 100% !important;
      max-width: 100% !important;
      height: ${d.barcodeHeightPx}px !important;
      max-height: ${d.barcodeHeightPx}px !important;
      object-fit: fill !important;
      display: block;
      margin: 0 auto;
    }
    .route { font-size: 5.5pt; font-weight: 700; padding: 1px 4px 2px; text-transform: uppercase; line-height: 1.1; }
    .kv { font-size: 7pt; line-height: 1.12; }
    .kv strong { font-size: 7.5pt; }
    .kv-dim { font-size: 7.5pt; font-weight: 700; line-height: 1.12; margin-top: 1px !important; }
    .kv div + div { margin-top: 1px; }
    .qr-cell { text-align: center; vertical-align: middle; padding: 2px 3px; }
    .qr-cell img {
      width: ${d.qrDisplayPx}px;
      height: ${d.qrDisplayPx}px;
      display: block;
      margin: 0 auto 2px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
    .qr-hint { font-size: 5pt; line-height: 1.1; color: #222; font-weight: 600; }
    .pay-cell { padding: 0; vertical-align: top; }
    .pay-body { text-align: center; padding: 2px 2px; }
    .pay-big { font-size: 14pt; font-weight: 800; line-height: 1; margin: 2px 0; }
    .pay-amt-lbl { background: #000; color: #fff; font-size: 5.5pt; font-weight: 700; padding: 2px 4px; text-transform: uppercase; }
    .pay-amt { font-size: 10pt; font-weight: 800; padding: 2px 4px 2px; }
    .icons-h { text-align: center; font-size: 5.5pt; font-weight: 700; text-transform: uppercase; padding: 2px 4px; border-bottom: 1px solid #000; }
    .icons { display: flex; justify-content: space-around; align-items: flex-start; padding: 1px 2px 2px; font-size: 4.5pt; font-weight: 700; text-align: center; line-height: 1.05; }
    .icons span { max-width: 32%; }
    .footer-wrap { padding: 0; overflow: hidden; line-height: 1.08; vertical-align: bottom !important; }
    .footer-bar { background: #000; color: #fff; text-align: center; font-weight: 800; font-size: 6pt; padding: 1.5px 2px; letter-spacing: 0.15px; }
    .footer-contact { text-align: center; font-size: 5pt; padding: 0 2px 1px; line-height: 1.1; white-space: nowrap; overflow: hidden; }
  `;
}

function renderSlipTable(d) {
  const { packingSlip, bluedart, order, awb, isCod } = d;
  return `<div class="slip-frame"><table class="sheet" cellspacing="0" cellpadding="0">
    <colgroup><col style="width:50%" /><col style="width:50%" /></colgroup>
    <tr class="r-head" style="height:8%">
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
    <tr class="r-address row-full" style="height:17%">
      <td colspan="2">
        <div class="sec-h">Ship To</div>
        <div class="sec-body txt">
          <strong>${esc(d.shipToName)}</strong> · ${esc(d.customerPhone)}<br>
          <span class="clamp">${esc(d.shipAddr)}</span>
        </div>
      </td>
    </tr>
    <tr class="r-barcode row-full" style="height:22%">
      <td colspan="2" class="awb-row">
        <div class="sec-h">AWB No.</div>
        <div class="awb-num">${esc(awb)}</div>
        <div class="barcode-wrap"><img id="awb-barcode" alt="" /></div>
        <div class="route">Routing Code: ${esc(d.route)}</div>
      </td>
    </tr>
    <tr class="r-order" style="height:14%">
      <td>
        <div class="sec-h">Order Details</div>
        <div class="sec-body kv">
          <div><strong>Order ID:</strong> #${esc(d.orderNum)}</div>
          <div><strong>Invoice No.:</strong> ${esc(invoiceNo(order))}</div>
          <div><strong>Order Date:</strong> ${esc(formatOrderDate(order.created_at))}</div>
        </div>
      </td>
      <td class="qr-cell">
        <img src="${d.qrUrl}" alt="Track QR" width="${d.qrDisplayPx}" height="${d.qrDisplayPx}" />
        <div class="qr-hint">Track your shipment<br>Scan QR code or visit<br>www.bluedart.com</div>
      </td>
    </tr>
    <tr class="r-product" style="height:14%">
      <td>
        <div class="sec-h">Product Details</div>
        <div class="sec-body kv">
          <div><strong>Item:</strong> ${esc(productSummary(order))}</div>
          <div><strong>Qty:</strong> ${productQty(order)}</div>
          <div><strong>Weight:</strong> ${d.weightKg} KG</div>
          <div class="kv-dim"><strong>Dimensions:</strong> ${esc(d.dimensionsText)}</div>
        </div>
      </td>
      <td class="pay-cell">
        <div class="sec-h">Payment Mode</div>
        <div class="pay-body">
          <div class="pay-big">${isCod ? 'COD' : 'PREPAID'}</div>
          ${isCod ? `<div class="pay-amt-lbl">COD Amount</div><div class="pay-amt">${esc(d.payAmount)}</div>` : ''}
        </div>
      </td>
    </tr>
    <tr class="r-shipper" style="height:17%">
      <td>
        <div class="sec-h">Shipper / Return Address</div>
        <div class="sec-body txt">
          <strong>${esc(bluedart.shipper.name)}</strong><br>
          <span class="clamp">${esc(d.returnAddr)}</span><br>
          ${esc(formatPhone(d.supportPh))}
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
    <tr class="r-footer" style="height:8%">
      <td colspan="2" class="footer-wrap">
        <div class="footer-bar">${esc(d.serviceFooter)} · ✂ SEAL INTACT ✂</div>
        <div class="footer-contact">THANK YOU — ${esc(packingSlip.logoText.toUpperCase())} · 📞 ${esc(formatPhone(d.supportPh))} · ${esc(packingSlip.websiteUrl)}</div>
      </td>
    </tr>
  </table></div>`;
}

function slipBarcodeScript(awb, autoPrint = false, barcodeOpts = {}) {
  const barH = Number(barcodeOpts.height) || 54;
  const barW = Number(barcodeOpts.width) || 1.75;
  const auto = autoPrint
    ? `function goPrint(){setTimeout(function(){window.focus();window.print();},400);}
       var imgs=document.querySelectorAll("img");
       var w=0; imgs.forEach(function(i){if(!i.complete)w++;});
       if(!w) goPrint(); else imgs.forEach(function(i){if(!i.complete){i.onload=i.onerror=goPrint;}});`
    : '';
  return `<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    JsBarcode("#awb-barcode", ${JSON.stringify(String(awb))}, {
      format: "CODE128", width: ${barW}, height: ${barH}, displayValue: false, margin: 4
    });
    (function () {
      var el = document.getElementById("awb-barcode");
      if (!el) return;
      el.style.width = "100%";
      el.style.maxWidth = "100%";
      el.style.height = "${barH}px";
      el.style.maxHeight = "${barH}px";
      el.style.objectFit = "fill";
    })();
    ${auto}
  <\/script>`;
}

/** Print-only page — exact 4×6 in, no preview chrome */
export function buildPackingSlipPrintHtml(order, awb, waybillMeta = {}) {
  const d = buildSlipData(order, awb, waybillMeta);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Print ${esc(order.name)} — ${esc(awb)}</title>
  <style>
    ${slipSheetCss(d)}
    html, body {
      width: ${d.printWmm}mm;
      height: ${d.printHmm}mm;
      max-width: ${d.printWmm}mm;
      max-height: ${d.printHmm}mm;
      margin: 0;
      padding: ${d.padTopMm}mm ${d.padSideMm}mm 0 ${d.padSideMm}mm;
      overflow: hidden;
      box-sizing: border-box;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7pt;
      line-height: 1.1;
      color: #000;
      page-break-after: avoid;
      break-after: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      html, body {
        width: ${d.printWmm}mm !important;
        height: ${d.printHmm}mm !important;
        max-height: ${d.printHmm}mm !important;
        margin: 0 !important;
        padding: ${d.padTopMm}mm ${d.padSideMm}mm 0 ${d.padSideMm}mm !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        page-break-after: avoid !important;
      }
      .slip-frame, .sheet {
        width: 100% !important;
        height: ${d.innerHmm}mm !important;
        max-height: ${d.innerHmm}mm !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .r-footer { page-break-inside: avoid !important; break-inside: avoid !important; }
    }
  </style>
</head>
<body>
  ${renderSlipTable(d)}
  ${slipBarcodeScript(awb, true, { height: d.barcodeHeightPx, width: d.barcodeBarWidth })}
</body>
</html>`;
}

/** Preview page with print button */
export function buildPackingSlipHtml(order, awb, waybillMeta = {}) {
  const d = buildSlipData(order, awb, waybillMeta);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${d.printWmm}, height=${d.printHmm}" />
  <title>Packing slip ${esc(order.name)} — ${esc(awb)}</title>
  <style>
    ${slipSheetCss(d)}
    html { background: #e8e8e8; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 6.5pt;
      line-height: 1.1;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-hint {
      max-width: 440px;
      margin: 10px auto;
      padding: 10px 14px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 8px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      text-align: center;
    }
    .print-hint button {
      margin-top: 8px;
      padding: 8px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: 0;
      border-radius: 6px;
      background: #b89774;
      color: #fff;
    }
    .print-hint .print-note { margin-top: 8px; font-size: 11px; color: #666; text-align: left; }
    .label-page {
      width: ${d.pageW};
      height: ${d.pageH};
      margin: 0 auto 12px;
      padding: ${d.marginTopIn} ${d.marginHIn} 0 ${d.marginHIn};
      overflow: hidden;
      background: #fff;
      box-shadow: 0 0 8px rgba(0,0,0,.18);
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div class="print-hint">
    <strong>Print 4×6 packing slip</strong><br>
    Opens a print page sized exactly <strong>4 × 6 inch</strong> (sharp text, not an image).
    <br>
    <button type="button" id="btn-print">Print 4×6 label</button>
    <p class="print-note">
      In print dialog set:<br>
      · Paper: <strong>4 × 6 in</strong> (100×150 mm)<br>
      · Scale: <strong>100%</strong> · Margins: <strong>None</strong><br>
      · Use your <strong>thermal label printer</strong> (not A4)
    </p>
  </div>

  <div class="label-page">
  ${renderSlipTable(d)}
  </div>

  ${slipBarcodeScript(awb, false, { height: d.barcodeHeightPx, width: d.barcodeBarWidth })}
  <script>
    document.getElementById("btn-print").addEventListener("click", function () {
      var u = new URL(location.href);
      u.searchParams.set("print", "1");
      window.open(u.toString(), "_blank");
    });
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
