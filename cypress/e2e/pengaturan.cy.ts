import { testEnv, loginWithUser } from '../support/commands';

// Membutuhkan server backend + akun berlangganan aktif (CYPRESS_USER_EMAIL / PASSWORD).
// Profil toko diubah lalu dikembalikan ke nilai semula; undangan anggota
// membuat data nyata dengan email unik.
describe('Pengaturan (backend)', () => {
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
		cy.get('[aria-label="Navigasi utama"]').contains('Pengaturan').click();
		cy.contains('h1', 'Profil toko & hak akses.').should('be.visible');
	});

	it('menyimpan profil toko lalu mengembalikannya', () => {
		cy.get('#shopName').invoke('val').then((original) => {
			cy.get('#shopName').clear().type(`${original} E2E`);
			cy.get('button').contains('Simpan profil').click();
			cy.assertToast('Profil toko disimpan');

			cy.get('#shopName').clear().type(original as string);
			cy.get('button').contains('Simpan profil').click();
			cy.assertToast('Profil toko disimpan');
		});
	});

	it('menampilkan bagian printer dan anggota', () => {
		cy.get('button').contains('Atur printer').should('be.visible');
		cy.contains('h2', 'Anggota tim & peran').should('be.visible');
		cy.get('button').contains('+ Undang anggota').should('be.visible');
	});

	it('mengundang anggota baru', () => {
		const email = `anggota-e2e-${slug()}@example.com`;
		cy.get('button').contains('+ Undang anggota').click();
		cy.get('#addMemberName').type('Anggota E2E');
		cy.get('#addMemberEmail').type(email);
		cy.get('#addMemberRole').select('kasir');
		cy.get('button').contains('Kirim undangan').click();
		cy.get('[role="dialog"][aria-label="Password sementara anggota"]').within(() => {
			cy.contains('Anggota E2E').should('be.visible');
			cy.contains(email).should('be.visible');
			cy.get('code').should('not.be.empty');
			cy.get('button').contains('Selesai').click();
		});
		cy.get('[role="dialog"]').should('not.exist');
	});
});