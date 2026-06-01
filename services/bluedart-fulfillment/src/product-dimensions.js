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

/** @returns {{ dimensions: string, weightKg: number|null } | null} */
function normalizeEntry(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string') {
    const dimensions = val.trim();
    return dimensions ? { dimensions, weightKg: null } : null;
  }
  if (typeof val === 'object') {
    const dimensions = String(val.dimensions || '').trim();
    const weightKg =
      val.weightKg != null && val.weightKg !== ''
        ? Number(val.weightKg)
        : val.weightG != null && val.weightG !== ''
          ? Number(val.weightG) / 1000
          : null;
    if (!dimensions && weightKg == null) return null;
    return {
      dimensions: dimensions || '',
      weightKg: Number.isFinite(weightKg) ? weightKg : null,
    };
  }
  return null;
}

function normalizeMap(rawMap = {}) {
  const out = {};
  for (const [key, val] of Object.entries(rawMap)) {
    const entry = normalizeEntry(val);
    if (entry && (entry.dimensions || entry.weightKg != null)) out[key] = entry;
  }
  return out;
}

function normalizeCatalog(raw) {
  const defaultEntry =
    normalizeEntry(raw?.default) ||
    normalizeEntry({ dimensions: config.packingSlip.dimensions });

  const base = {
    default: defaultEntry,
    byProductId: normalizeMap(raw?.byProductId),
    bySku: normalizeMap(raw?.bySku),
    byHandle: normalizeMap(raw?.byHandle),
    byTitleContains: normalizeMap(raw?.byTitleContains),
  };

  for (const row of raw?.products || []) {
    if (!row || typeof row !== 'object') continue;
    const entry = normalizeEntry(row);
    if (!entry) continue;
    if (row.productId) base.byProductId[String(row.productId)] = entry;
    if (row.sku) base.bySku[String(row.sku).trim()] = entry;
    if (row.handle) base.byHandle[String(row.handle).trim()] = entry;
    if (row.titleContains) base.byTitleContains[String(row.titleContains).trim()] = entry;
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

function matchFromMap(map, key) {
  if (!key) return null;
  return map[key] || null;
}

/** Match line item → { dimensions, weightKg } from local JSON */
export function resolveLocalProductSpec(item, catalog = loadProductDimensionsCatalog()) {
  const productId = String(item.product_id || '').trim();
  let spec = matchFromMap(catalog.byProductId, productId);

  if (!spec) {
    const sku = String(item.sku || '').trim();
    spec = matchFromMap(catalog.bySku, sku);
  }

  if (!spec) {
    const handle = String(item.handle || item.product_handle || '').trim();
    spec = matchFromMap(catalog.byHandle, handle);
  }

  if (!spec) {
    const title = String(item.title || item.name || '').trim();
    if (title) {
      const titleLower = title.toLowerCase();
      const needles = Object.keys(catalog.byTitleContains).sort(
        (a, b) => b.length - a.length
      );
      for (const needle of needles) {
        if (titleLower.includes(needle.toLowerCase())) {
          spec = catalog.byTitleContains[needle];
          break;
        }
      }
    }
  }

  return spec || catalog.default || null;
}

export function resolveLocalProductDimension(item, catalog = loadProductDimensionsCatalog()) {
  return resolveLocalProductSpec(item, catalog)?.dimensions || null;
}

/** Apply local dimensions + weight to all line items */
export function applyLocalProductDimensions(order) {
  const catalog = loadProductDimensionsCatalog();
  const line_items = (order.line_items || []).map((item) => {
    const spec = resolveLocalProductSpec(item, catalog);
    if (!spec) return item;
    const next = { ...item };
    if (spec.dimensions) next.packing_slip_dimensions = spec.dimensions;
    if (spec.weightKg != null) next.packing_slip_weight_kg = spec.weightKg;
    return next;
  });
  return { ...order, line_items };
}

export function localDimensionsOnly() {
  return config.packingSlip.localDimensionsOnly;
}

export function getDimensionsCatalogPath() {
  return catalogPath();
}
