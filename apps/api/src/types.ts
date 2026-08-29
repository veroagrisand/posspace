import type { SupabaseClient } from '@supabase/supabase-js';

/** Deklarasi variabel context Hono agar c.get('db'|'accessToken'|'userId') ter-tipe. */
declare module 'hono' {
	interface ContextVariableMap {
		accessToken?: string;
		userId?: string;
		db: SupabaseClient;
	}
}