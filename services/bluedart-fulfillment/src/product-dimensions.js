import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let catalogCache = null;
let catalogMtime = 0;

function catalogPath() {
  const rel = config.packingSlip.dimensionsFile || 'config/product-dimensions.json';
  return resolve(__dirname, '..', rel);
}

function normalizeCatalog(raw) {
  const base = {
    default: String(raw?.default || config.packingSlip.dimensions || '').trim(),
    byProductId: { ...(raw?.byProductId || {}) },
    bySku: { ...(raw?.bySku || {}) },
    byTitleContains: { ...(raw?.byTitleContains || {}) },
  };

  for (const row of raw?.products || []) {
    if (!row || typeof row !== 'object') continue;
    const dim = String(row.dimensions || '').trim();
    if (!dim) continue;
    if (row.productId) base.byProductId[String(row.productId)] = dim;
    if (row.sku) base.bySku[String(row.sku).trim()] = dim;
    if (row.titleContains) base.byTitleContains[String(row.titleContains).trim()] = dim;
  }

  return base;
}

export function loadProductDimensionsCatalog(force = false) {
  const path = catalogPath();
  if (!existsSync(path)) {
    catalogCache = normalizeCatalog({});
    return catalogCache;
  }

  const mtime = statSync(path).mtimeMs;
  if (!force && catalogCache && mtime === catalogMtime) {
    return catalogCache;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    catalogCache = normalizeCatalog(raw);
    catalogMtime = mtime;
  } catch {
    catalogCache = normalizeCatalog({});
  }
  return catalogCache;
}

/** Match line item to dimensions from local JSON (longest title match wins) */
export function resolveLocalProductDimension(item, catalog = loadProductDimensionsCatalog()) {
  const productId = String(item.product_id || '').trim();
  if (productId && catalog.byProductId[productId]) {
    return catalog.byProductId[productId];
  }

  const sku = String(item.sku || '').trim();
  if (sku && catalog.bySku[sku]) {
    return catalog.bySku[sku];
  }

  const title = String(item.title || item.name || '').trim();
  if (title) {
    const titleLower = title.toLowerCase();
    const needles = Object.keys(catalog.byTitleContains).sort(
      (a, b) => b.length - a.length
    );
    for (const needle of needles) {
      if (titleLower.includes(needle.toLowerCase())) {
        return catalog.byTitleContains[needle];
      }
    }
  }

  return catalog.default || null;
}

/** Apply local dimensions to all line items on an order */
export function applyLocalProductDimensions(order) {
  const catalog = loadProductDimensionsCatalog();
  const line_items = (order.line_items || []).map((item) => {
    const dim = resolveLocalProductDimension(item, catalog);
    return dim ? { ...item, packing_slip_dimensions: dim } : item;
  });
  return { ...order, line_items };
}

export function localDimensionsOnly() {
  return config.packingSlip.localDimensionsOnly;
}

export function getDimensionsCatalogPath() {
  return catalogPath();
}
