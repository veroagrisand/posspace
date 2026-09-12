describe('Halaman publik', () => {
	it('landing page: hero, CTA, dan paket harga', () => {
		cy.visit('/');
		cy.contains('h1', 'tanpa hitung manual.').should('be.visible');
		cy.get('.hero-actions').within(() => {
			cy.contains('a', 'Langganan sekarang').should('have.attr', 'href', '/register');
			cy.contains('a', 'Coba demo kasir').should('have.attr', 'href', '/demo');
		});
		cy.get('#fitur').should('exist');
		cy.get('#cara-kerja').should('exist');
		cy.get('#harga').should('exist');
		cy.get('#faq').should('exist');
		cy.get('[href^="/register?plan="]').should('have.length.at.least', 3);
	});

	it('navigasi publik menuju halaman auth', () => {
		cy.visit('/');
		cy.contains('a', 'Langganan').first().click();
		cy.url().should('include', '/register');
		cy.visit('/');
		cy.contains('a', 'Masuk').first().click();
		cy.url().should('include', '/login');
	});

	it('halaman FAQ', () => {
		cy.visit('/faq');
		cy.contains('h2', 'Pertanyaan yang sering diajukan').should('be.visible');
	});

	it('halaman kontak', () => {
		cy.visit('/kontak');
		cy.contains('h2', 'Informasi usaha').should('be.visible');
	});

	it('halaman syarat & ketentuan', () => {
		cy.visit('/terms-and-conditions');
		cy.contains('h2', '1. Penerimaan ketentuan').should('be.visible');
	});

	it('halaman kebijakan refund', () => {
		cy.visit('/refund-policy');
		cy.contains('h2', '1. Ruang lingkup').should('be.visible');
	});

	it('health check endpoint', () => {
		cy.request('/health').its('body').then((body) => {
			expect(body.ok).to.eq(true);
			expect(body.service).to.eq('posspace-web');
		});
	});

	it('halaman setup (belum dikonfigurasi)', () => {
		cy.visit('/setup');
		cy.contains('h1', 'Aplikasi belum dikonfigurasi').should('be.visible');
	});

	it('404 menampilkan halaman error posspace', () => {
		cy.visit('/halaman-tidak-ada', { failOnStatusCode: false });
		cy.get('#error-title').should('exist');
		cy.contains('a', 'Kembali ke beranda').should('exist');
	});
});