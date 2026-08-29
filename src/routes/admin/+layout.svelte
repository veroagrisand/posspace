<script lang="ts">
	import '../../lib/css/base.css';
	import '../../lib/css/admin.css';
	import { page } from '$app/state';
	import { getBrowserClient } from '$lib/supabase';
	import { clearDemoSession } from '$lib/demo';

	let { children, data }: { children: import('svelte').Snippet; data: any } = $props();

	const pathname = $derived(page.url.pathname);

	const navItems = [
		{ href: '/admin', label: 'Ringkasan SaaS', icon: 'dashboard', match: (p: string) => p === '/admin' },
		{ href: '/admin/subscriptions', label: 'Langganan', icon: 'card', match: (p: string) => p.startsWith('/admin/subscriptions') },
		{ href: '/admin/shops', label: 'Toko terdaftar', icon: 'shops', match: (p: string) => p.startsWith('/admin/shops') },
		{ href: '/admin/cms', label: 'Konten & Voucher', icon: 'cms', match: (p: string) => p.startsWith('/admin/cms') },
		{ href: '/admin/monitor', label: 'Log & Monitor', icon: 'monitor', match: (p: string) => p.startsWith('/admin/monitor') }
	];

	async function handleSignOut() {
		const supabase = getBrowserClient();
		if (supabase) {
			await supabase.auth.signOut();
		} else {
			clearDemoSession();
		}
		window.location.href = '/login';
	}
</script>

<div class="admin-shell">
	<aside class="admin-sidebar" aria-label="Navigasi admin">
		<a class="brand" href="/admin" aria-label="posspace admin">
			<span class="brand-mark" aria-hidden="true">ps</span>
			<span class="brand-copy">
				<strong>pos</strong><small>space</small>
			</span>
		</a>

		<div class="admin-kicker">KONTROL SAAS</div>
		<nav class="admin-nav">
			{#each navItems as item}
				<a class="nav-item" class:active={item.match(pathname)} href={item.href}>
					{#if item.icon === 'dashboard'}
						<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>
					{:else if item.icon === 'card'}
						<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>
					{:else if item.icon === 'cms'}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
					{:else if item.icon === 'monitor'}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5v-9Z" /><path d="M3 17.5h18M8.5 20h7" /></svg>
					{:else}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5 12 3.5l8.5 5-8.5 5-8.5-5Z" /><path d="m3.5 12.5 8.5 5 8.5-5M3.5 16.5l8.5 5 8.5-5" /></svg>
					{/if}
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="sidebar-bottom" style="margin-top:auto">
			<div class="admin-utils">
				<a href="/" aria-label="Beranda posspace" title="Beranda">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4v-9Z" /></svg>
					<span>Beranda</span>
				</a>
				<a href="/app" aria-label="Buka aplikasi kasir" title="Buka aplikasi kasir">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2" /></svg>
					<span>Buka kasir</span>
				</a>
			</div>
			<div class="profile-card">
				<span class="avatar" style="background:#d29a3b">{data.admin.user.email.slice(0, 2).toUpperCase()}</span>
				<span class="profile-copy">
					<strong>{data.admin.user.email}</strong>
					<small>Platform admin · SaaS owner</small>
				</span>
				<button class="icon-button profile-more" type="button" onclick={handleSignOut} aria-label="Keluar dari dashboard" title="Keluar">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9M16 17l5-5-5-5M21 12H9" /></svg>
				</button>
			</div>
		</div>
	</aside>

	<main class="admin-main">{@render children()}</main>
</div>