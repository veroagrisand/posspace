import { env } from './env.js';

/** Simulasi pembayaran sukses — HANYA untuk pengembangan lokal. */
export const ALLOW_MOCK_PAYMENT = env.ALLOW_MOCK_PAYMENT === 'true';