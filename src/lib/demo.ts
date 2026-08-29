import { isSupabaseConfigured } from '$lib/supabase';

export interface DemoUser {
	name: string;
	email: string;
	shopName: string;
	role: string;
	plan: string;
	password: string;
}

const SESSION_KEY = 'posspace.session';
const USERS_KEY = 'posspace.users';

function readJSON<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function writeJSON(key: string, value: unknown) {
	localStorage.setItem(key, JSON.stringify(value));
}

export function isDemoMode(): boolean {
	return !isSupabaseConfigured;
}

export function getDemoUsers(): DemoUser[] {
	return readJSON<DemoUser[]>(USERS_KEY, []);
}

export function getDemoSession(): { email: string; name: string; shopName: string; role: string; plan: string } | null {
	return readJSON<{ email: string; name: string; shopName: string; role: string; plan: string } | null>(SESSION_KEY, null);
}

export function createDemoUser(input: Omit<DemoUser, 'role' | 'plan'>, plan: string): DemoUser {
	const users = getDemoUsers();
	const user: DemoUser = {
		...input,
		role: 'pemilik',
		plan
	};
	users.push(user);
	writeJSON(USERS_KEY, users);
	saveDemoSession(user);
	return user;
}

export function saveDemoSession(user: Pick<DemoUser, 'name' | 'email' | 'shopName' | 'role' | 'plan'>) {
	writeJSON(SESSION_KEY, {
		email: user.email,
		name: user.name,
		shopName: user.shopName,
		role: user.role,
		plan: user.plan
	});
}

export function loginDemo(email: string, password: string): DemoUser | null {
	const user = getDemoUsers().find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
	if (!user) return null;
	saveDemoSession(user);
	return user;
}

export function clearDemoSession() {
	localStorage.removeItem(SESSION_KEY);
}
