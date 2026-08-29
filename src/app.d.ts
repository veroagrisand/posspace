// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient | null;
			demoMode: boolean;
			/** Access token sesi (untuk proxy /api → gateway). */
			accessToken: string | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};