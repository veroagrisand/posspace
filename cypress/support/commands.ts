/// <reference types="cypress" />

// Cypress v16 menghapus Cypress.env() dan Cypress.config('env') (runtime maupun
// typings). Baca environment variable lewat cy.env(['key', ...]) yang chainable.

export interface DemoSeedUser {
	name: string;
	email: string;
	shopName: string;
	password: string;
}

export type EnvKey = 'posspaceMode' | 'userEmail' | 'userPassword' | 'adminEmail' | 'adminPassword' | 'registerEmail';

/** Baca environment variable Cypress (v16: hanya lewat cy.env(array)). */
export function testEnv<K extends EnvKey>(keys: K[]): Cypress.Chainable<Record<K, string>> {
	return cy.env(keys).then((env) => env as Record<K, string>);
}

/** Login dengan akun user biasa dari env (CYPRESS_USER_EMAIL / PASSWORD). */
export function loginWithUser() {
	return testEnv(['userEmail', 'userPassword']).then(({ userEmail, userPassword }) => {
		cy.login(userEmail, userPassword);
	});
}

/** Login dengan akun platform admin dari env (CYPRESS_ADMIN_EMAIL / PASSWORD). */
export function loginWithAdmin() {
	return testEnv(['adminEmail', 'adminPassword']).then(({ adminEmail, adminPassword }) => {
		cy.login(adminEmail, adminPassword);
	});
}

declare global {
	namespace Cypress {
		interface Chainable {
			login(email: string, password: string): Chainable<void>;
			seedDemoUser(user: DemoSeedUser): Chainable<void>;
			openShift(cash?: number): Chainable<void>;
			closeShift(actualCash: number): Chainable<void>;
			addProduct(product: string, variant: string): Chainable<void>;
			payCash(received: number): Chainable<void>;
			payDigital(method: 'QRIS' | 'Debit', ref?: string): Chainable<void>;
			assertToast(message: string): Chainable<void>;
		}
	}
}

Cypress.Commands.add('login', (email: string, password: string) => {
	cy.visit('/login');
	cy.get('#email').type(email);
	cy.get('#password').type(password);
	cy.get('.auth-submit').click();
});

/** Siapkan akun demo langsung di localStorage (mode demo tanpa Supabase). */
Cypress.Commands.add('seedDemoUser', (user: DemoSeedUser) => {
	cy.window().then((win) => {
		const record = { ...user, role: 'pemilik', plan: 'pro' };
		win.localStorage.setItem('posspace.users', JSON.stringify([record]));
		win.localStorage.setItem(
			'posspace.session',
			JSON.stringify({ email: user.email, name: user.name, shopName: user.shopName, role: 'pemilik', plan: 'pro' })
		);
	});
});

/** Buka shift dari halaman kasir (/demo atau /app). */
Cypress.Commands.add('openShift', (cash = 500000) => {
	cy.get('button').contains('Buka shift').first().click();
	cy.get('[role="dialog"][aria-label="Shift kasir"]').within(() => {
		cy.get('#openingCash').clear().type(String(cash));
		cy.get('button').contains('Buka shift').click();
	});
	cy.get('[role="dialog"]').should('not.exist');
});

/** Tutup shift dari halaman kasir dan verifikasi rekap sukses. */
Cypress.Commands.add('closeShift', (actualCash: number) => {
	cy.get('button').contains('Tutup shift').first().click();
	cy.get('[role="dialog"][aria-label="Shift kasir"]').within(() => {
		cy.get('#actualCash').clear().type(String(actualCash));
		cy.get('button').contains('Tutup & simpan rekap').click();
		cy.contains('Shift berhasil ditutup').should('be.visible');
		cy.get('button').contains('Selesai').click();
	});
	cy.get('[role="dialog"]').should('not.exist');
});

/** Tambah produk ke keranjang lewat tombol aria-label "Tambah {nama} {varian}". */
Cypress.Commands.add('addProduct', (product: string, variant: string) => {
	cy.get(`[aria-label="Tambah ${product} ${variant}"]`).first().click();
});

/** Bayar tunai: set #cashReceived lalu klik tombol bayar. */
Cypress.Commands.add('payCash', (received: number) => {
	cy.get('.payment-method').contains('Tunai').click();
	cy.get('#cashReceived').clear().type(String(received));
	cy.get('.pay-button').click();
});

/** Bayar QRIS/Debit dengan referensi opsional. */
Cypress.Commands.add('payDigital', (method: 'QRIS' | 'Debit', ref?: string) => {
	cy.get('.payment-method').contains(method).click();
	if (ref) cy.get('#qrRef').type(ref);
	cy.get('.pay-button').click();
});

/** Assert toast terakhir (role=status, hilang setelah 3 detik). */
Cypress.Commands.add('assertToast', (message: string) => {
	cy.get('.toast').should('contain', message);
});