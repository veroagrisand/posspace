import { testEnv, loginWithAdmin } from '../support/commands';

// Membutuhkan server backend + akun platform admin
// (CYPRESS_ADMIN_EMAIL / CYPRESS_ADMIN_PASSWORD). Login admin otomatis
// diarahkan ke /admin oleh halaman masuk.
describe('Dashboard admin SaaS (backend)', () => {
	before(function () {
		testEnv(['posspaceMode', 'adminEmail', 'adminPassword']).then(({ posspaceMode, adminEmail, adminPassword }) => {
			if (posspaceMode !== 'backend' || !adminEmail || !adminPassword) this.skip();
		});
	});

	beforeEach(() => {
		loginWithAdmin();
		cy.url({ timeout: 15000 }).should('include', '/admin');
	});

	it('menampilkan ringkasan SaaS dan navigasi', () => {
		cy.contains('h1', 'Ringkasan seluruh SaaS').should('be.visible');
		cy.get('[aria-label="Navigasi admin"] .admin-nav').within(() => {
			cy.contains('Ringkasan SaaS').should('be.visible');
			cy.contains('Langganan').should('be.visible');
			cy.contains('Toko terdaftar').should('be.visible');
			cy.contains('Konten & Voucher').should('be.visible');
			cy.contains('Log & Monitor').should('be.visible');
		});
	});

	it('membuka halaman kelola langganan', () => {
		cy.get('[aria-label="Navigasi admin"]').contains('Langganan').click();
		cy.contains('h1', 'Kelola langganan UMKM').should('be.visible');
	});

	it('membuka halaman toko terdaftar', () => {
		cy.get('[aria-label="Navigasi admin"]').contains('Toko terdaftar').click();
		cy.contains('h1', 'Toko terdaftar').should('be.visible');
		cy.get('input[placeholder="Cari toko..."]').should('be.visible');
	});

	it('membuka halaman konten & voucher', () => {
		cy.get('[aria-label="Navigasi admin"]').contains('Konten & Voucher').click();
		cy.contains('h1', 'Konten & Voucher').should('be.visible');
	});

	it('membuka halaman log & monitor', () => {
		cy.get('[aria-label="Navigasi admin"]').contains('Log & Monitor').click();
		cy.contains('h1', 'Log & Monitor backend').should('be.visible');
	});

	it('keluar dari dashboard admin', () => {
		cy.get('button[aria-label="Keluar dari dashboard"]').click();
		cy.url({ timeout: 15000 }).should('include', '/login');
	});
});