import { testEnv, loginWithUser } from '../support/commands';

// Membutuhkan server backend (npm run dev + npm run dev:api) dan akun dengan
// langganan aktif. Di-set via CYPRESS_USER_EMAIL / CYPRESS_USER_PASSWORD.
// Data uji memakai nama unik ber-suffix timestamp; menu yang dibuat dihapus
// kembali lewat UI (bahan baku tidak memiliki hapus → dibiarkan).
describe('Menu & resep (backend)', () => {
	const slug = () => Date.now().toString().slice(-8);

	before(function () {
		testEnv(['posspaceMode', 'userEmail', 'userPassword']).then(({ posspaceMode, userEmail, userPassword }) => {
			if (posspaceMode !== 'backend' || !userEmail || !userPassword) this.skip();
		});
	});

	beforeEach(() => {
		loginWithUser();
		cy.url({ timeout: 15000 }).should('not.include', '/login');
		cy.get('[aria-label="Navigasi utama"]').should('be.visible');
		cy.get('[aria-label="Navigasi utama"]').contains('Menu & resep').click();
		cy.contains('h1', 'Menu, resep, dan bahan baku.').should('be.visible');
	});

	it('menampilkan tabel menu dan bahan baku', () => {
		cy.get('.data-table').should('have.length.at.least', 2);
		cy.contains('h2', 'Menu aktif').should('be.visible');
		cy.contains('h2', 'Ingredient & satuan').should('be.visible');
	});

	it('menambahkan menu baru dengan varian', () => {
		const name = `Espresso E2E ${slug()}`;
		cy.get('button').contains('+ Tambah menu').click();
		cy.get('#addName').type(name);
		cy.get('#addCategory').select('Kopi');
		cy.get('#addVariantName').type('Reguler');
		cy.get('#addPrice').type('15000');
		cy.get('button').contains('Simpan menu').click();
		cy.assertToast('Menu baru ditambahkan');
		cy.contains('td', name).should('be.visible');
	});

	it('menonaktifkan dan mengaktifkan kembali menu', () => {
		const name = `Toggle E2E ${slug()}`;
		cy.get('button').contains('+ Tambah menu').click();
		cy.get('#addName').type(name);
		cy.get('#addCategory').select('Kopi');
		cy.get('#addVariantName').type('Reguler');
		cy.get('#addPrice').type('12000');
		cy.get('button').contains('Simpan menu').click();
		cy.contains('td', name).should('be.visible');

		cy.get(`input[aria-label="${name} aktif"]`).uncheck();
		cy.get(`input[aria-label="${name} aktif"]`).should('not.be.checked');
		cy.get(`input[aria-label="${name} aktif"]`).check();
		cy.get(`input[aria-label="${name} aktif"]`).should('be.checked');
	});

	it('menghapus menu yang baru dibuat', () => {
		const name = `Hapus E2E ${slug()}`;
		cy.get('button').contains('+ Tambah menu').click();
		cy.get('#addName').type(name);
		cy.get('#addCategory').select('Makanan');
		cy.get('#addVariantName').type('1 porsi');
		cy.get('#addPrice').type('10000');
		cy.get('button').contains('Simpan menu').click();
		cy.contains('td', name).should('be.visible');

		cy.on('window:confirm', () => true);
		cy.contains('td', name).closest('tr').within(() => {
			cy.get('button').contains('Kelola').click();
		});
		cy.get('button').contains('Hapus menu').click();
		cy.contains('td', name).should('not.exist');
	});

	it('menambahkan bahan baku baru', () => {
		const name = `Bahan E2E ${slug()}`;
		cy.get('button').contains('+ Kelola bahan').click();
		cy.get('#ingName').type(name);
		cy.get('#ingUnit').select('gram');
		cy.get('#ingMin').type('100');
		cy.get('#ingStock').type('1000');
		cy.get('#ingCost').type('750');
		cy.get('.modal-actions').contains('Simpan').click();
		cy.assertToast('Bahan baku ditambahkan');
		cy.contains('td', name).should('be.visible');
	});

	it('menolak nama bahan baku duplikat', () => {
		const name = `Duplikat E2E ${slug()}`;
		cy.get('button').contains('+ Kelola bahan').click();
		cy.get('#ingName').type(name);
		cy.get('#ingUnit').select('pcs');
		cy.get('#ingMin').type('5');
		cy.get('#ingStock').type('50');
		cy.get('#ingCost').type('500');
		cy.get('.modal-actions').contains('Simpan').click();
		cy.contains('td', name).should('be.visible');

		cy.get('button').contains('+ Kelola bahan').click();
		cy.get('#ingName').type(name);
		cy.get('#ing-name-taken').should('be.visible');
		cy.get('.modal-actions').contains('Simpan').should('be.disabled');
	});
});