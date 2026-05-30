/** Regenerate packing slip for an existing AWB: node scripts/regenerate-slip.mjs 90532504952 1476 */
import { getOrder } from '../src/shopify.js';
import { savePackingSlip, saveLabelPrintPage } from '../src/packing-slip.js';

const [awb, orderRef] = process.argv.slice(2);
if (!awb || !orderRef) {
  console.error('Usage: node scripts/regenerate-slip.mjs <AWB> <order-name-or-id>');
  process.exit(1);
}

const order = await getOrder(orderRef);
savePackingSlip(order, awb);
saveLabelPrintPage(awb);
console.log('Saved:', `labels/${awb}-packing-slip.html`);
console.log('Open:', `http://localhost:8787/api/packing-slip/${awb}`);
console.log('Label print:', `http://localhost:8787/api/print-label/${awb}`);
