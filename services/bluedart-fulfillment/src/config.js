import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function optional(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function envFirst(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function optionalAny(names, fallback = '') {
  const value = envFirst(...names);
  return value || fallback;
}

/** Blue Dart portal may show "PLN347970" = area PLN + numeric customer code 347970 */
export function normalizeBlueDartAccount(rawCode, rawArea = 'PLN') {
  const input = String(rawCode || '').trim().toUpperCase();
  let area = String(rawArea || 'PLN').trim().toUpperCase();
  let customerCode = input;

  const areaPrefixed = input.match(/^([A-Z]{3})(\d+)$/);
  if (areaPrefixed) {
    area = areaPrefixed[1];
    customerCode = areaPrefixed[2];
  } else if (/^\d+$/.test(input)) {
    customerCode = input;
  }

  return { area, customerCode };
}

const bluedartAccount = normalizeBlueDartAccount(
  optional('BLUEDART_CUSTOMER_CODE'),
  optional('BLUEDART_ORIGIN_AREA', 'PLN')
);

export const config = {
  port: Number(
    process.env.PORT ||
      optional('PORT', process.env.NODE_ENV === 'production' ? '3000' : '8787')
  ),
  apiSecret: optional('API_SECRET', ''),
  publicUrl: optional('PUBLIC_URL', ''),

  /** manual | webhook | batch | all */
  autoFulfillMode: optional('AUTO_FULFILL_MODE', 'manual').toLowerCase(),
  /** When mode is batch or all, run every N minutes (0 = off) */
  autoFulfillCronMinutes: Number(optional('AUTO_FULFILL_CRON_MINUTES', '0')),
  autoFulfillBatchLimit: Number(optional('AUTO_FULFILL_BATCH_LIMIT', '25')),
  autoFulfillNotifyCustomer: optional('AUTO_FULFILL_NOTIFY_CUSTOMER', 'true') !== 'false',

  bluedart: {
    loginId: optional('BLUEDART_LOGIN_ID'),
    password: optional('BLUEDART_PASSWORD'),
    shippingLicenceKey: optionalAny([
      'BLUEDART_SHIPPING_LICENCE_KEY',
      'BLUEDART_SHIPPING_LICENSE_KEY',
    ]),
    trackingLicenceKey: optionalAny([
      'BLUEDART_TRACKING_LICENCE_KEY',
      'BLUEDART_TRACKING_LICENSE_KEY',
    ]),
    version: optional('BLUEDART_API_VERSION', '1.3'),
    customerCode: bluedartAccount.customerCode,
    originArea: bluedartAccount.area,
    productCode: optional('BLUEDART_PRODUCT_CODE', 'A'),
    subProductCode: optional('BLUEDART_SUB_PRODUCT_CODE', 'P'),
    shipper: {
      name: optional('BLUEDART_SHIPPER_NAME', 'Grosyhub'),
      address1: optional('BLUEDART_SHIPPER_ADDRESS1'),
      address2: optional('BLUEDART_SHIPPER_ADDRESS2', 'Palanpur'),
      address3: optional('BLUEDART_SHIPPER_ADDRESS3', 'Gujarat, India'),
      pincode: optional('BLUEDART_SHIPPER_PINCODE', '385001'),
      mobile: optional('BLUEDART_SHIPPER_MOBILE'),
      email: optional('BLUEDART_SHIPPER_EMAIL', 'support@grosyhub.com'),
      gstin: optional('BLUEDART_SHIPPER_GSTIN', ''),
    },
    baseUrl: 'https://apigateway.bluedart.com/in/transportation',
  },

  packingSlip: {
    logoText: optional('PACKING_SLIP_LOGO', optional('BLUEDART_SHIPPER_NAME', 'Grosyhub')),
    serviceLabel: optional('PACKING_SLIP_SERVICE_LABEL', 'DART APEX'),
    dimensions: optional('PACKING_SLIP_DIMENSIONS', '10.00 * 10.00 * 10.00(cm)'),
    invoicePrefix: optional('PACKING_SLIP_INVOICE_PREFIX', 'GH'),
    /** Portrait print size — default 4×6 inch (101.6 × 152.4 mm) */
    pageWidth: optional('PACKING_SLIP_PAGE_WIDTH', '4in'),
    pageHeight: optional('PACKING_SLIP_PAGE_HEIGHT', '6in'),
    printWidthMm: optional('PACKING_SLIP_PRINT_WIDTH_MM', '101.6'),
    printHeightMm: optional('PACKING_SLIP_PRINT_HEIGHT_MM', '152.4'),
    /** Left + right inset on slip (mm each side) */
    printMarginHorizontalMm: optional('PACKING_SLIP_MARGIN_H_MM', '3'),
    websiteUrl: optional('PACKING_SLIP_WEBSITE', 'www.grosyhub.com'),
    supportPhone: optional('PACKING_SLIP_SUPPORT_PHONE', optional('BLUEDART_SHIPPER_MOBILE', '')),
    legalNote: optional(
      'PACKING_SLIP_LEGAL_NOTE',
      "All disputes are subject to Gujarat jurisdiction only. Goods once sold will only be taken back or exchanged as per the store's exchange/return policy."
    ),
    supportEmail: optional('PACKING_SLIP_SUPPORT_EMAIL', optional('BLUEDART_SHIPPER_EMAIL', 'support@grosyhub.com')),
  },

  shopify: {
    shop: optional('SHOPIFY_SHOP', 'igh9a1-1h.myshopify.com'),
    accessToken: optional('SHOPIFY_ACCESS_TOKEN'),
    clientId: optional('SHOPIFY_CLIENT_ID'),
    clientSecret: optional('SHOPIFY_CLIENT_SECRET'),
    webhookSecret: optional('SHOPIFY_WEBHOOK_SECRET'),
    apiVersion: optional('SHOPIFY_API_VERSION', '2025-04'),
  },
};

export function assertBlueDartAuthConfig() {
  required('BLUEDART_LOGIN_ID');
  required('BLUEDART_PASSWORD');
  required('BLUEDART_SHIPPING_LICENCE_KEY');
}

export function assertBlueDartConfig() {
  assertBlueDartAuthConfig();
  required('BLUEDART_CUSTOMER_CODE');
  required('BLUEDART_SHIPPER_ADDRESS1');
  required('BLUEDART_SHIPPER_MOBILE');
}

export function assertShopifyConfig() {
  const hasToken = Boolean(process.env.SHOPIFY_ACCESS_TOKEN?.trim());
  const hasClientCreds =
    Boolean(process.env.SHOPIFY_CLIENT_ID?.trim()) &&
    Boolean(process.env.SHOPIFY_CLIENT_SECRET?.trim());
  if (!hasToken && !hasClientCreds) {
    throw new Error(
      'Set SHOPIFY_ACCESS_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in .env'
    );
  }
}
