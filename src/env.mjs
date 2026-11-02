// env.mjs — load a .env file (no dependency). Looked up in: $DC_ENV, ./.env, <project>/.env.
// Shell variables win over the file, so an exported key is never overridden.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [process.env.DC_ENV, path.resolve(process.cwd(), '.env'), path.join(project, '.env')].filter(Boolean);

export function loadEnv() {
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
    return file;
  }
  return null;
}

export const ENV_FILE = loadEnv();
