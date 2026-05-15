/**
 * Copy sql.js WASM into public/ so Next.js API routes can read it from disk
 * (reliable on Vercel and when node_modules layout differs from cwd).
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const src = require.resolve('sql.js/dist/sql-wasm.wasm');
const destDir = join(root, 'public', 'vendor');
const dest = join(destDir, 'sql-wasm.wasm');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
