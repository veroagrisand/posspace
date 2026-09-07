<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();

	const STORAGE_KEY = 'posspace-theme';
	let theme = $state<'light' | 'dark'>('light');

	function apply(next: 'light' | 'dark') {
		theme = next;
		if (next === 'dark') document.documentElement.dataset.theme = 'dark';
		else delete document.documentElement.dataset.theme;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			/* abaikan */
		}
	}

	$effect(() => {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(STORAGE_KEY);
		} catch {
			/* abaikan */
		}
		theme =
			stored === 'dark' || stored === 'light'
				? stored
				: window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light';
		apply(theme);
	});

	function toggle() {
		apply(theme === 'dark' ? 'light' : 'dark');
	}
</script>

<button class="theme-toggle {className}" type="button" onclick={toggle} aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'} title={theme === 'dark' ? 'Mode gelap, klik untuk terang' : 'Mode terang, klik untuk gelap'}>
	{#if theme === 'dark'}
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>
		<span class="theme-label">Terang</span>
	{:else}
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.5A8.5 8.5 0 0 1 9.5 3.6a8.5 8.5 0 1 0 10.9 10.9Z" /></svg>
		<span class="theme-label">Gelap</span>
	{/if}
</button>