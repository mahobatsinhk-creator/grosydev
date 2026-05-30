import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from './config.js';

export function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = config.shopify.clientSecret || config.shopify.webhookSecret;
  if (!secret || !hmacHeader) return false;

  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export function parseWebhookOrder(rawBody) {
  const data = JSON.parse(rawBody);
  return {
    id: data.id,
    name: data.name,
    financialStatus: data.financial_status,
    fulfillmentStatus: data.fulfillment_status,
  };
}

export function shouldAutoFulfillOrder(order) {
  if (order.fulfillmentStatus === 'fulfilled') return false;
  if (order.financialStatus === 'voided' || order.financialStatus === 'refunded') return false;
  return true;
}
