<script lang="ts">
	import { store, openShift, closeShift, formatClockLabel } from '$lib/store.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { trapFocus } from '$lib/focusTrap';
	import { untrack } from 'svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let mode = $state<'open' | 'close'>('open');
	let openingCash = $state(500000);
	let actualCash = $state(0);
	let result: { expectedCash: number; difference: number } | null = $state(null);
	let justClosed = $state(false);
	let saving = $state(false);
	let dialogEl = $state<HTMLElement | null>(null);
	let lastFocused: HTMLElement | null = null;

	function reset() {
		mode = 'open';
		openingCash = 500000;
		actualCash = 0;
		result = null;
		justClosed = false;
		if (store.shift.status === 'open') mode = 'close';
	}

	// Reset hanya saat modal BARU dibuka. Tanpa untrack, efek ini ikut
	// mengeksekusi ulang saat store.shift.status berubah (mis. setelah shift
	// ditutup) dan menghapus hasil rekap "berhasil ditutup" yang baru tampil.
	$effect(() => {
		if (open) untrack(() => reset());
	});

	$effect(() => {
		if (!open) return;
		lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (dialogEl) {
			dialogEl.setAttribute('tabindex', '-1');
			dialogEl.focus();
		}
		return () => {
			lastFocused?.focus();
		};
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			closeDialog();
		}
	}

	async function handleSubmit() {
		if (saving) return;
		saving = true;
		try {
			if (mode === 'open') {
				await openShift(openingCash);
				open = false;
				showToast('Shift dibuka dengan saldo awal');
			} else {
				result = await closeShift(actualCash);
				justClosed = true;
			}
		} catch (err) {
			showToast(`Gagal: ${err instanceof Error ? err.message : 'error'}`);
		} finally {
			saving = false;
		}
	}

	function closeDialog() {
		if (justClosed) open = false;
		else open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" role="presentation" onclick={(e) => {
		if (e.target === e.currentTarget && !justClosed) open = false;
	}}>
		<div
			class="modal-card"
			role="dialog" tabindex="-1"
			aria-modal="true"
			aria-label="Shift kasir"
			bind:this={dialogEl}
			onkeydown={onKeydown}
			use:trapFocus
		>
			<div class="modal-head">
				<h3>{mode === 'open' ? 'Buka shift' : 'Tutup shift: rekap kas'}</h3>
				<button class="icon-button" type="button" onclick={closeDialog} aria-label="Tutup dialog">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<div class="modal-body">
				{#if store.shift.status === 'open' && mode === 'open'}
					<div class="au-demo-note">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="M12 9v4M12 16h.01" /></svg>
						<span>Shift sedang aktif sejak {formatClockLabel(store.shift.openedAt)} dengan saldo awal {store.shift.openingCash.toLocaleString('id-ID')}. Anda bisa melihat rekap untuk menutupnya.</span>
					</div>
					<button class="button button-secondary" type="button" style="margin-top:12px;width:100%" onclick={() => (mode = 'close')}>Lihat rekap &amp; tutup shift</button>
				{/if}

				{#if mode === 'open'}
					<div class="au-field">
						<label for="openingCash">Saldo awal kas (Rp)</label>
						<div class="cash-input-wrap"><span>Rp</span><input id="openingCash" type="number" min="0" step="50000" bind:value={openingCash} /></div>
					</div>
					<p style="color:#5d6861;font-size:10px;margin-top:8px;line-height:1.5">Saldo awal digunakan sebagai dasar hitung kas yang diharapkan saat shift ditutup.</p>
				{:else if mode === 'close' && !justClosed}
					<div class="shift-rekap">
						<div><span>Saldo awal</span><strong>{store.shift.openingCash.toLocaleString('id-ID')}</strong></div>
						<div><span>Total penjualan shift</span><strong>{store.transactions.reduce((s, t) => s + t.total, 0).toLocaleString('id-ID')}</strong></div>
						<div><span>Kas yang diharapkan</span><strong>{result?.expectedCash.toLocaleString('id-ID') ?? (store.shift.openingCash + store.transactions.reduce((s, t) => s + t.total, 0)).toLocaleString('id-ID')}</strong></div>
					</div>
					<div class="au-field">
						<label for="actualCash">Kas aktual di laci (Rp)</label>
						<div class="cash-input-wrap"><span>Rp</span><input id="actualCash" type="number" min="0" step="10000" bind:value={actualCash} /></div>
					</div>
				{:else if justClosed && result}
					<div class="success-box">
						<span class="toast-check">✓</span>
						<strong>Shift berhasil ditutup</strong>
						<p>Kas yang diharapkan {result.expectedCash.toLocaleString('id-ID')} · aktual {actualCash.toLocaleString('id-ID')}</p>
						<p class="trend-good" style="font-weight:700">Selisih {result.difference >= 0 ? '+' : ''}{result.difference.toLocaleString('id-ID')}</p>
					</div>
				{/if}

				<div style="display:flex;gap:9px;margin-top:20px">
					{#if mode === 'open'}
						<button class="button button-primary" type="button" style="flex:1" disabled={saving} onclick={handleSubmit}>
							{#if saving}<span class="btn-spinner"></span>Membuka...{:else}Buka shift{/if}
						</button>
					{:else if !justClosed}
						<button class="button button-secondary" type="button" disabled={saving} onclick={() => (mode = 'open')}>Kembali</button>
						<button class="button button-primary" type="button" style="flex:1" disabled={saving} onclick={handleSubmit}>
							{#if saving}<span class="btn-spinner"></span>Menyimpan...{:else}Tutup &amp; simpan rekap{/if}
						</button>
					{:else}
						<button class="button button-primary" type="button" style="flex:1" onclick={() => (open = false)}>Selesai</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
