import { testEnv } from '../support/commands';

// Perilaku /app tanpa sesi tergantung konfigurasi server:
// - backend (Supabase aktif):        → redirect /login
// - belum dikonfigurasi, no demo:    → redirect /setup
// - demo (ALLOW_DEMO_MODE=true):     → kasir demo langsung tampil
describe('Guard akses (redirect server-side)', () => {
	const assertAppUnreachable = () => {
		cy.url().then((url) => {
			if (url.includes('/login')) {
				cy.get('#email').should('be.visible');
			} else if (url.includes('/setup')) {
				cy.contains('h1', 'Aplikasi belum dikonfigurasi').should('be.visible');
			} else {
				// Mode demo (ALLOW_DEMO_MODE=true): shell aplikasi tampil tanpa
				// sesi, data hanya dari browser (bukan backend).
				cy.get('[aria-label="Navigasi utama"]').should('be.visible');
				cy.contains('Mode demo').should('be.visible');
			}
		});
	};

	it('/app tanpa sesi tidak pernah membuka data backend', () => {
		cy.visit('/app');
		assertAppUnreachable();
	});

	it('/app/menu tanpa sesi ikut guard /app', () => {
		cy.visit('/app/menu');
		assertAppUnreachable();
	});

	it('/admin tanpa sesi admin: demo → /setup, backend → /login', () => {
		cy.visit('/admin', { failOnStatusCode: false });
		testEnv(['posspaceMode']).then(({ posspaceMode }) => {
			if (posspaceMode === 'backend') {
				cy.url().should('include', '/login');
			} else {
				cy.url().should('include', '/setup');
			}
		});
	});
});