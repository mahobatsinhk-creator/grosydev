import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const labelsDir = resolve(__dirname, '../labels');
mkdirSync(labelsDir, { recursive: true });
