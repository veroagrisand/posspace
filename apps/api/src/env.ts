import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Muat .env dari root monorepo (posspace/.env) — berlaku untuk dev dan build
// (dist/env.js berada satu tingkat lebih dalam, jalur relatif tetap sama).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const env = process.env;

export const isSupabaseConfigured = Boolean(
	env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);