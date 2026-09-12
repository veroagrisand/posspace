import { testEnv, loginWithUser } from '../support/commands';

describe('Autentikasi', () => {
	describe('halaman masuk', () => {
		beforeEach(() => {
			cy.visit('/login');
		});

		it('merender formulir masuk', () => {
			cy.contains('h1', 'Masuk ke akun Anda').should('be.visible');
			cy.get('#email').should('be.visible');
			cy.get('#password').should('be.visible');
			cy.get('.auth-submit').should('contain', 'Masuk');
			cy.contains('a', 'Lupa kata sandi?').should('have.attr', 'href', '/lupa-password');
			cy.contains('a', 'Daftar gratis').should('have.attr', 'href', '/register');
		});

		it('toggle visibilitas kata sandi', () => {
			cy.get('#password').type('rahasia123');
			cy.get('#password').should('have.attr', 'type', 'password');
			cy.get('button[aria-label="Tampilkan kata sandi"]').click();
			cy.get('#password').then(($password) => {
				if ($password.attr('type') === 'password') {
					cy.get('button[aria-label="Tampilkan kata sandi"]').click();
				}
			});
			cy.get('#password').should('have.attr', 'type', 'text');
			cy.get('button[aria-label="Sembunyikan kata sandi"]').click();
			cy.get('#password').should('have.attr', 'type', 'password');
		});

		it('submit kosong tidak mengirim (validasi native)', () => {
			cy.get('.auth-submit').click();
			cy.url().should('include', '/login');
			cy.get('#login-error').should('not.exist');
		});

		it('menampilkan pesan kesalahan untuk akun yang tidak terdaftar (demo)', function () {
			testEnv(['posspaceMode']).then(({ posspaceMode }) => {
				if (posspaceMode === 'backend') this.skip();
				cy.get('#email').type('tidak-ada@demo.local');
				cy.get('#password').type('salah');
				cy.get('.auth-submit').click();
				cy.get('#login-error').should('contain', 'Akun belum terdaftar. Coba daftar terlebih dahulu.');
			});
		});

		it('masuk dengan akun demo menuju aplikasi (demo)', function () {
			testEnv(['posspaceMode']).then(({ posspaceMode }) => {
				if (posspaceMode === 'backend') this.skip();
				cy.seedDemoUser({ name: 'Kasir Demo', email: 'kasir@demo.local', shopName: 'Kopi Senja (demo)', password: 'demo-pass-123' });
				cy.get('#email').type('kasir@demo.local');
				cy.get('#password').type('demo-pass-123');
				cy.get('.auth-submit').click();
				cy.url().should('include', '/app');
				cy.contains('h1', 'Kasir cepat, stok tetap tepat.').should('be.visible');
			});
		});

		it('masuk dengan akun backend menuju aplikasi (backend)', function () {
			testEnv(['posspaceMode', 'userEmail', 'userPassword']).then(({ posspaceMode, userEmail, userPassword }) => {
				if (posspaceMode !== 'backend' || !userEmail || !userPassword) this.skip();
				cy.login(userEmail, userPassword);
				cy.url().should('not.include', '/login');
				cy.contains('h1').should('be.visible');
			});
		});
	});

	describe('halaman daftar', () => {
		beforeEach(() => {
			cy.visit('/register');
		});

		it('merender wizard 3 langkah', () => {
			cy.contains('h1', 'Buat akun baru').should('be.visible');
			cy.get('[aria-label="Langkah pendaftaran"]').within(() => {
				cy.contains('1 · Email').should('be.visible');
				cy.contains('2 · Kode OTP').should('be.visible');
				cy.contains('3 · Data toko').should('be.visible');
			});
			cy.contains('a', 'Masuk').should('have.attr', 'href', '/login');
		});

		it('validasi format email di langkah pertama', () => {
			cy.get('#email').type('bukan-email');
			cy.get('.auth-submit').click();
			cy.url().should('include', '/register');
			cy.get('#reg-email-error').should('not.exist'); // diblokir validasi native type=email
		});

		it('wizard pendaftaran penuh dengan kode OTP debug (backend)', function () {
			testEnv(['posspaceMode', 'registerEmail']).then(({ posspaceMode, registerEmail }) => {
				if (posspaceMode !== 'backend' || !registerEmail) this.skip();
				const email = registerEmail;

				cy.get('#email').type(email);
				cy.get('.auth-submit').click();

				cy.contains('2 · Kode OTP').should('be.visible');
				cy.get('.auth-notice')
					.invoke('text')
					.should('match', /Mode uji coba: kode OTP Anda adalah \d{6}/)
					.then((text) => {
						const code = text.match(/\d{6}/)?.[0];
						expect(code).to.exist;
						cy.get('#otp').type(code as string);
						cy.get('.auth-submit').click();
					});

				cy.contains('3 · Data toko').should('be.visible');
				cy.get('#name').type('Pengguna E2E');
				cy.get('#shop').type('Toko E2E');
				cy.get('#password').type('password-e2e-123');
				cy.get('#confirm-password').type('password-e2e-123');
				cy.get('#plan').select('starter');
				cy.get('.auth-submit').click();

				cy.url({ timeout: 15000 }).should('include', '/subscribe');
			});
		});
	});

	describe('lupa kata sandi', () => {
		beforeEach(() => {
			cy.visit('/lupa-password');
		});

		it('merender formulir', () => {
			cy.contains('h1', 'Lupa kata sandi?').should('be.visible');
			cy.get('#email').should('be.visible');
			cy.get('.auth-submit').should('contain', 'Kirim tautan reset');
			cy.contains('a', 'Masuk').should('have.attr', 'href', '/login');
		});

		it('menampilkan catatan mode demo (demo)', function () {
			testEnv(['posspaceMode']).then(({ posspaceMode }) => {
				if (posspaceMode === 'backend') this.skip();
				cy.contains('Mode demo belum mendukung reset kata sandi').should('be.visible');
			});
		});
	});

	describe('reset kata sandi', () => {
		it('merender halaman tanpa token recovery', () => {
			cy.visit('/reset-password');
			cy.contains('h1', 'Atur ulang kata sandi').should('be.visible');
		});
	});
});