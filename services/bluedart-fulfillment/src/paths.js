import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const labelsDir = resolve(__dirname, '../labels');
try {
  mkdirSync(labelsDir, { recursive: true });
} catch (err) {
  console.warn('[labels] Could not create labels folder:', err.message);
}
