import { buildWaybillPayload } from './bluedart.js';

function cleanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits || '9999999999';
}

function splitAddress(address) {
  const lines = String(address || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    address1: lines[0] || 'Address',
    address2: lines.slice(1, 3).join(', '),
    city: lines.at(-1) || '',
  };
}

export function shopifyOrderToWaybill(order) {
  const shipping = order.shipping_address;
  if (!shipping) {
    throw new Error(`Order ${order.name} has no shipping address`);
  }

  const addr = splitAddress(shipping.address1);
  const pincode = shipping.zip?.replace(/\D/g, '').slice(0, 6);
  if (!pincode || pincode.length !== 6) {
    throw new Error(`Order ${order.name}: invalid pincode ${shipping.zip}`);
  }

  const totalWeightGrams = (order.line_items || []).reduce((sum, item) => {
    return sum + (item.grams || 200) * (item.quantity || 1);
  }, 0);

  const weightKg = Math.max(0.2, totalWeightGrams / 1000);
  const declaredValue = Number(order.total_price || order.current_total_price || 0);

  const paymentGateway = (order.payment_gateway_names || []).join(' ').toLowerCase();
  const isCod =
    order.financial_status === 'pending' ||
    paymentGateway.includes('cod') ||
    paymentGateway.includes('cash on delivery');

  const codAmount = isCod ? declaredValue : 0;

  const lineItems = (order.line_items || []).map((item) => ({
    sku: item.sku,
    title: item.title,
    quantity: item.quantity,
    price: Number(item.price),
  }));

  const orderRef = String(order.name || order.id).replace('#', '');

  return buildWaybillPayload({
    orderRef,
    consignee: {
      name: shipping.name || `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
      address1: addr.address1,
      address2: shipping.address2 || addr.address2 || shipping.city || '',
      city: shipping.city || addr.city,
      pincode,
      mobile: cleanPhone(shipping.phone || order.phone),
      email: order.email || order.contact_email || '',
    },
    weightKg,
    declaredValue,
    codAmount,
    lineItems,
  });
}

export function summarizeOrder(order) {
  const s = order.shipping_address || {};
  return {
    id: order.id,
    name: order.name,
    createdAt: order.created_at,
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status,
    total: order.total_price,
    customer: s.name || order.email,
    pincode: s.zip,
    city: s.city,
    itemCount: order.line_items?.length || 0,
  };
}
