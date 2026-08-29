/** Error HTTP dengan kode mesin (sama seperti SvelteKit error()). */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		public readonly details?: unknown
	) {
		super(code);
		this.name = 'HttpError';
	}
}

export function httpError(status: number, code: string, details?: unknown): never {
	throw new HttpError(status, code, details);
}

/** Helper respons JSON (konsisten dengan json() SvelteKit). */
export function json(data: unknown, status = 200): Response {
	return Response.json(data, { status });
}