import { testEnv, loginWithUser } from '../support/commands';

// Membutuhkan server backend + akun berlangganan aktif (CYPRESS_USER_EMAIL / PASSWORD).
// Pembelian & opname membuat data uji nyata di database — pakai nilai minimal.
describe('Inventaris (backend)', () => {
	before(function () {
		testEnv(['posspaceMode', 'userEmail', 'userPassword']).then(({ posspaceMode, userEmail, userPassword }) => {
			if (posspaceMode !== 'backend' || !userEmail || !userPassword) this.skip();
		});
	});

	beforeEach(() => {
		loginWithUser();
		cy.url({ timeout: 15000 }).should('not.include', '/login');
		cy.get('[aria-label="Navigasi utama"]').should('be.visible');
		cy.get('[aria-label="Navigasi utama"]').contains('Inventaris').click();
		cy.contains('h1', 'Bahan baku selalu terpantau.').should('be.visible');
	});

	it('menampilkan tabel stok dan tombol aksi', () => {
		cy.get('#stok').should('be.visible');
		cy.get('button').contains('Hitung fisik').should('be.visible');
		cy.get('button').contains('+ Catat pembelian').should('be.visible');
	});

	it('mencatat pembelian stok', () => {
		cy.get('button').contains('+ Catat pembelian').click();
		cy.get('#purchaseIngredient').select(0);
		cy.get('#purchaseQty').clear().type('5');
		cy.get('#purchaseTotal').clear().type('25000');
		cy.get('button').contains('Simpan pembelian').click();
		cy.assertToast('Pembelian dicatat, stok bertambah otomatis');
		cy.get('.data-table').first().should('not.contain', 'Bahan tidak ditemukan');
	});

	it('membuka modal harga modal (HPP)', () => {
		cy.get('.hpp-cell').first().click();
		cy.contains('Atur harga modal (HPP)').should('be.visible');
		cy.get('#costValue').should('be.visible');
		cy.get('button').contains('Simpan harga modal').should('be.visible');
		cy.get('button').contains('Batal').click();
	});

	it('membuat dan menyetujui draft opname', () => {
		cy.get('button').contains('Hitung fisik').click();
		cy.get('#opnameIngredient').select(0);
		cy.get('#opnameActual').clear().type('1');
		cy.get('button').contains('Buat draft opname').click();
		cy.assertToast('Hasil hitung fisik dicatat sebagai draft');
		cy.get('#opnameReason').type('Uji e2e: koreksi stok');
		cy.get('button').contains('Setujui & sesuaikan').click();
		cy.assertToast('Selisih disetujui, stok sistem disesuaikan');
	});
});