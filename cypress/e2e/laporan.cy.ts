import { testEnv, loginWithUser } from '../support/commands';

// Membutuhkan server backend + akun berlangganan aktif (CYPRESS_USER_EMAIL / PASSWORD).
describe('Laporan (backend)', () => {
	before(function () {
		testEnv(['posspaceMode', 'userEmail', 'userPassword']).then(({ posspaceMode, userEmail, userPassword }) => {
			if (posspaceMode !== 'backend' || !userEmail || !userPassword) this.skip();
		});
	});

	beforeEach(() => {
		loginWithUser();
		cy.url({ timeout: 15000 }).should('not.include', '/login');
		cy.get('[aria-label="Navigasi utama"]').should('be.visible');
		cy.get('[aria-label="Navigasi utama"]').contains('Laporan').click();
		cy.contains('h1', 'Omzet, HPP, dan laba dalam satu klik.').should('be.visible');
	});

	it('menampilkan kartu metrik laporan', () => {
		cy.contains('Omzet').should('be.visible');
		cy.contains('Transaksi').should('be.visible');
		cy.contains('HPP total').should('be.visible');
		cy.contains('Laba kotor').should('be.visible');
		cy.contains('Beban operasional').should('be.visible');
		cy.contains('Laba bersih').should('be.visible');
	});

	it('mengganti periode laporan', () => {
		cy.get('select[aria-label="Periode laporan"]').select('Bulanan');
		cy.get('select[aria-label="Periode laporan"]').should('have.value', 'Bulanan');
		cy.get('select[aria-label="Periode laporan"]').select('Keseluruhan');
		cy.get('select[aria-label="Periode laporan"]').should('have.value', 'Keseluruhan');
	});

	it('menyediakan tombol ekspor', () => {
		cy.get('button').contains('Ekspor stok').should('be.visible');
		cy.get('button').contains('Excel').should('be.visible');
		cy.get('button').contains('PDF').should('be.visible');
	});
});