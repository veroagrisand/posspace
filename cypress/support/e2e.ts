import './commands';

// Isolasi antar-test: state demo & tema disimpan di browser storage.
// Cookie sesi Supabase (backend mode) tidak terpengaruh.
beforeEach(() => {
	cy.window().then((win) => {
		win.localStorage.clear();
		win.sessionStorage.clear();
	});
});