import { testEnv, loginWithUser } from '../support/commands';

// Membutuhkan server backend + akun login (CYPRESS_USER_EMAIL / PASSWORD).
// Halaman /subscribe menampilkan salah satu dari 3 status: pilih paket,
// invoice pending, atau langganan aktif — ketiganya diuji cabangnya.
describe('Langganan (backend)', () => {
	before(function () {
		testEnv(['posspaceMode', 'userEmail', 'userPassword']).then(({ posspaceMode, userEmail, userPassword }) => {
			if (posspaceMode !== 'backend' || !userEmail || !userPassword) this.skip();
		});
	});

	beforeEach(() => {
		loginWithUser();
		cy.url({ timeout: 15000 }).should('not.include', '/login');
		cy.visit('/subscribe');
		cy.contains('h1', 'Berlangganan posspace').should('be.visible');
	});

	it('menampilkan pilihan paket dan periode penagihan', function () {
		cy.get('body').then(($body) => {
			if (!$body.find('.plan-select').length) this.skip();
		});
		cy.get('.plan-select').should('have.length.at.least', 3);
		cy.get('[role="group"][aria-label="Periode penagihan"]').within(() => {
			cy.contains('button', 'Bulanan').should('have.attr', 'aria-pressed', 'true');
			cy.contains('button', 'Tahunan').click();
		});
		cy.get('.plan-select').first().click();
		cy.get('button[type="submit"]').should('contain', 'Lanjut ke pembayaran');
	});

	it('menampilkan invoice pending dengan voucher', function () {
		cy.get('body').then(($body) => {
			if (!$body.find('#voucher').length) this.skip();
		});
		cy.get('#voucher').should('have.attr', 'aria-label', 'Kode voucher');
		cy.get('button').contains('Pakai voucher').should('be.visible');
		cy.get('button').contains('Saya sudah membayar').should('be.visible');
	});

	it('menampilkan status langganan aktif', function () {
		cy.get('body').then(($body) => {
			if (!$body.find('.success-box').length) this.skip();
		});
		cy.contains('Langganan aktif').should('be.visible');
		cy.contains('a', 'Masuk ke aplikasi').should('have.attr', 'href', '/app');
	});
});