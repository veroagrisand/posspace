import { testEnv, loginWithUser } from '../support/commands';

// Membutuhkan server backend + akun berlangganan aktif (CYPRESS_USER_EMAIL / PASSWORD).
describe('Operasional (backend)', () => {
	before(function () {
		testEnv(['posspaceMode', 'userEmail', 'userPassword']).then(({ posspaceMode, userEmail, userPassword }) => {
			if (posspaceMode !== 'backend' || !userEmail || !userPassword) this.skip();
		});
	});

	beforeEach(() => {
		loginWithUser();
		cy.url({ timeout: 15000 }).should('not.include', '/login');
		cy.get('[aria-label="Navigasi utama"]').should('be.visible');
		cy.get('[aria-label="Navigasi utama"]').contains('Operasional').click();
		cy.contains('h1', 'Listrik, sewa, gaji: semua tercatat.').should('be.visible');
	});

	it('menampilkan kartu metrik beban', () => {
		cy.contains('Laba BERSIH').should('be.visible');
		cy.contains('Beban operasional').should('be.visible');
	});

	it('mencatat beban operasional sekali beli', () => {
		const today = new Date().toISOString().slice(0, 10);
		cy.get('button').contains('+ Catat beban').click();
		cy.get('#addType').select('sekali');
		cy.get('#addCategory').select(1);
		cy.get('#addAmount').clear().type('35000');
		cy.get('#addDate').type(today);
		cy.get('#addNote').type('Uji e2e beban');
		cy.get('button').contains('Simpan beban').click();
		cy.assertToast('Beban operasional dicatat');
		cy.contains('Uji e2e beban').should('be.visible');
	});
});