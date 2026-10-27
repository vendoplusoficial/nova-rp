import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'data'),
  AUTOSAVE_SECONDS: 20,
  TOKEN_DAYS: 14,
  LOGIN_ATTEMPTS_PER_MIN: 12,
};
