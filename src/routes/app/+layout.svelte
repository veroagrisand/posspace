<script lang="ts">
	import '../../lib/css/app.css';
	import { page } from '$app/state';
	import { getDemoSession, clearDemoSession } from '$lib/demo';
	import { toastState } from '$lib/toast.svelte';
	import { backend, printer } from '$lib/store.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import PrinterSetup from '$lib/components/PrinterSetup.svelte';

	let { children, data }: { children: import('svelte').Snippet; data: any } = $props();

	let user = $state<{ name: string; role: string; shopName: string } | null>(null);
	let printerSetupOpen = $state(false);
	let wizardDismissed = $state(false);

	const navItems = [
		{ href: '/app', label: 'Kasir', icon: 'cashier', module: 'Kasir' },
		{ href: '/app/menu', label: 'Menu & resep', icon: 'menu', module: 'Menu & Resep' },
		{ href: '/app/inventaris', label: 'Inventaris', icon: 'stock', module: 'Inventaris' },
		{ href: '/app/laporan', label: 'Laporan', icon: 'report', module: 'Laporan' },
		{ href: '/app/pengaturan', label: 'Pengaturan', icon: 'settings', module: 'Pengaturan' }
	];

	// Data otorisasi berasal dari server (guard layout server) — bukan localStorage.
	$effect(() => {
		if (data?.demo) {
			const session = getDemoSession();
			if (!session) {
				window.location.href = '/login';
				return;
			}
			user = { name: session.name, role: session.role, shopName: session.shopName };
			backend.enabled = false;
		} else if (data?.user && data?.shop) {
			user = {
				name: data.user.email ?? 'Pengguna',
				role: data.shop.profileRole,
				shopName: data.shop.shopName
			};
			backend.enabled = true;
			backend.shopId = data.shop.shopId;
			backend.role = data.shop.profileRole;
			backend.shopName = data.shop.shopName;
			backend.subscription = data.shop.subscription;
			void hydrateBackend();
		}
	});

	async function hydrateBackend() {
		const { hydrateStore, loadPrinterSettings } = await import('$lib/store.svelte');
		await hydrateStore();
		await loadPrinterSettings();
		// Wizard setup printer: muncul untuk pemilik saat pertama kali login
		// setelah langganan aktif dan pengaturan printer belum pernah disimpan.
		if (backend.role === 'pemilik' && printer.loaded && !printer.configured && !wizardDismissed) {
			wizardDismissed = true;
			printerSetupOpen = true;
		}
	}

	function initials(name: string) {
		return name
			.split(' ')
			.map((part) => part[0])
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	function handleSignOut() {
		if (backend.enabled) {
			window.location.href = '/login';
		} else {
			clearDemoSession();
			window.location.href = '/';
		}
	}

	const pathname = $derived(page.url.pathname);
</script>

{#if !data || data.demo || (data.user && data.shop)}
	<div class="app-shell">
		<aside class="sidebar" aria-label="Navigasi utama">
			<a class="brand" href="/app" aria-label="posspace">
				<span class="brand-mark" aria-hidden="true">ps</span>
				<span class="brand-copy">
					<strong>pos</strong><small>space</small>
				</span>
			</a>

			<div class="sidebar-label">Menu utama</div>
			<nav class="sidebar-nav">
				{#each navItems as item}
					<a class="nav-item" class:active={pathname === item.href} href={item.href}>
						{#if item.icon === 'cashier'}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z" /><path d="M7.5 8h9M7.5 12h2M12 12h2M16.5 12h.01M7.5 16h2M12 16h2M16.5 16h.01" /></svg>
						{:else if item.icon === 'menu'}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z" /><path d="M8 8h8M8 12h8M8 16h4" /></svg>
						{:else if item.icon === 'stock'}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></svg>
						{:else if item.icon === 'settings'}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" /><path d="M19.4 15v.03a1.7 1.7 0 0 1-.62 3.1l-.62.1a1.7 1.7 0 0 1-1.58-.7l-.35-.5a7.6 7.6 0 0 1-1.7 1l-.07.6a1.7 1.7 0 0 1-3.15.65l-.3-.54a7.8 7.8 0 0 1-1.96-.02l-.31.54a1.7 1.7 0 0 1-3.14-.66l-.07-.61a7.7 7.7 0 0 1-1.68-.99l-.52.31a1.7 1.7 0 0 1-2.53-1.91l.2-.6a7.8 7.8 0 0 1-.98-1.7l-.6-.07a1.7 1.7 0 0 1-.66-3.14l.54-.31a7.7 7.7 0 0 1 .02-1.96l-.54-.31a1.7 1.7 0 0 1 .66-3.14l.6-.07a7.8 7.8 0 0 1 .99-1.68l-.31-.52a1.7 1.7 0 0 1 1.91-2.53l.6.2a7.8 7.8 0 0 1 1.7-.98l.07-.6a1.7 1.7 0 0 1 3.14-.66l.31.54a7.7 7.7 0 0 1 1.96.02l.31-.54a1.7 1.7 0 0 1 3.14.66l.07.6a7.7 7.7 0 0 1 1.68.99l.52-.31a1.7 1.7 0 0 1 2.53 1.91l-.2.6a7.8 7.8 0 0 1 .98 1.7l.6.07a1.7 1.7 0 0 1 .66 3.14l-.54.31a7.7 7.7 0 0 1-.02 1.96l.54.31" /></svg>
						{:else}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9L19 7v13.5H6V3.5Z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7" /></svg>
						{/if}
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>

			<div class="sidebar-bottom">
				<div class="offline-card">
					<div class="offline-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24"><path d="M5 9.5a10.7 10.7 0 0 1 14 0M8 13a6.2 6.2 0 0 1 8 0M11 16.5a1.7 1.7 0 0 1 2 0M3 6a14.5 14.5 0 0 1 18 0" /></svg>
					</div>
					<div>
						<strong>Data tersinkron</strong>
						<span>Semua perangkat online</span>
					</div>
					<span class="online-dot" aria-label="Online"></span>
				</div>
				<div class="profile-card">
					{#if user}
						<span class="avatar">{initials(user.name)}</span>
						<span class="profile-copy">
							<strong>{user.name}</strong>
							<small>{user.shopName} · {user.role}</small>
						</span>
					{/if}
					<button class="icon-button profile-more" type="button" onclick={handleSignOut} aria-label="Keluar dari aplikasi">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9M16 17l5-5-5-5M21 12H9" /></svg>
					</button>
				</div>
			</div>
		</aside>

		<main class="main-content">{@render children()}</main>
	</div>

	<Toast message={toastState.message} />
	<PrinterSetup bind:open={printerSetupOpen} />
{/if}
