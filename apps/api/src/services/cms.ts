import { Hono } from 'hono';
import { json, httpError } from '../http.js';
import { requirePlatformAdmin } from '../guards.js';
import { service } from '../db.js';

/**
 * Service CMS — konten landing page + daftar paket.
 * GET publik (dengan cache in-memory), PUT khusus platform admin.
 */

const LANDING_CACHE_TTL_MS = 30_000;
let landingCache: { at: number; payload: unknown } | null = null;

export const cmsService = new Hono();

/** GET /api/cms/landing — konten landing page + daftar paket (publik, cache 30 dtk). */
cmsService.get('/landing', async (c) => {
	if (landingCache && Date.now() - landingCache.at < LANDING_CACHE_TTL_MS) {
		return json(landingCache.payload);
	}

	const db = service();
	const [{ data: row }, { data: plans }] = await Promise.all([
		db.from('landing_content').select('content, updated_at').eq('id', 1).maybeSingle(),
		db.from('plans').select('id, name, monthly_price, annual_price, features, is_active').order('monthly_price')
	]);

	const payload = {
		content: (row?.content as Record<string, unknown>) ?? {},
		updatedAt: row?.updated_at ?? null,
		plans: (plans ?? []).filter((p) => p.is_active).map((p) => ({ ...p, features: p.features ?? [] }))
	};
	landingCache = { at: Date.now(), payload };
	return json(payload);
});

/** PUT /api/cms/landing — simpan konten landing page (khusus platform admin). */
cmsService.put('/landing', async (c) => {
	const admin = await requirePlatformAdmin(c);

	const body = (await c.req.json().catch(() => ({}))) as { content?: Record<string, unknown> };
	const content = body.content ?? {};
	if (typeof content !== 'object' || Array.isArray(content)) httpError(400, 'INVALID_CONTENT');

	const db = service();
	const { error: upsertError } = await db
		.from('landing_content')
		.upsert(
			{
				id: 1,
				content,
				updated_by: admin.user.id,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'id' }
		)
		.select('content, updated_at')
		.single();

	if (upsertError) httpError(500, 'SAVE_FAILED');
	landingCache = null; // invalidate cache

	return json({ ok: true, content });
});