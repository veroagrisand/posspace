<script lang="ts">
	import { printer, savePrinterSettings, dismissPrinterSetup, backend } from '$lib/store.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { buildReceiptLines, printAgent, printWebUsb, type PrinterType } from '$lib/printing';

	let {
		open = $bindable(false)
	}: {
		open?: boolean;
	} = $props();

	let step = $state<'choose' | 'test' | 'done'>('choose');
	let printerType = $state<PrinterType | 'none'>('webusb');
	let paperWidth = $state<'58' | '80'>('80');
	let agentUrl = $state('http://127.0.0.1:9123');
	let testing = $state(false);
	let testResult = $state('');
	let saving = $state(false);

	const options: { id: PrinterType | 'none'; label: string; desc: string }[] = [
		{ id: 'none', label: 'Tidak mencetak struk', desc: 'Struk cukup tampil di layar — bisa diaktifkan kapan saja dari menu Pengaturan' },
		{ id: 'webusb', label: 'Printer USB (thermal)', desc: 'Kabel USB langsung ke PC kasir — dicetak tanpa driver (Chrome/Edge)' },
		{ id: 'browser', label: 'Printer sistem (browser)', desc: 'Pakai printer yang sudah terpasang di Windows/Mac lewat dialog cetak' },
		{ id: 'agent', label: 'Printer jaringan / agen lokal', desc: 'Printer Ethernet/WiFi (TCP 9100) atau USB — lewat agen cetak di PC kasir' }
	];

	$effect(() => {
		if (open) {
			step = 'choose';
			testResult = '';
			printerType = printer.enabled ? (printer.printerType === 'webusb' || printer.printerType === 'agent' ? printer.printerType : 'webusb') : 'none';
			paperWidth = printer.paperWidth;
			agentUrl = printer.agentUrl || 'http://127.0.0.1:9123';
		}
	});

	function sampleLines(): string[] {
		return buildReceiptLines(
			{
				shop: { name: backend.shopName || 'posspace', address: '', phone: '' },
				receiptNo: 'PS-TEST-0001',
				dateLabel: new Date().toLocaleDateString('id-ID'),
				timeLabel: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
				cashier: 'Pemilik',
				items: [{ productName: 'Es Kopi Susu (Reguler)', variant: 'Reguler', qty: 2, unitPrice: 22000, lineTotal: 44000 }],
				subtotal: 44000,
				tax: 4400,
				total: 48400,
				paymentMethod: 'cash',
				cashReceived: 50000,
				changeAmount: 1600
			},
			paperWidth
		);
	}

	async function runTest() {
		testing = true;
		testResult = '';
		try {
			const lines = sampleLines();
			if (printerType === 'webusb') {
				await printWebUsb(lines, paperWidth);
				testResult = 'Cetak uji berhasil dikirim ke printer USB.';
			} else if (printerType === 'agent') {
				await printAgent(lines, paperWidth, agentUrl);
				testResult = 'Cetak uji terkirim ke agen cetak.';
			} else {
				window.print();
				testResult = 'Dialog cetak browser dibuka — pilih printer struk lalu cetak.';
			}
			step = 'done';
		} catch (err) {
			testResult = err instanceof Error ? err.message : 'Cetak uji gagal.';
		} finally {
			testing = false;
		}
	}

	async function save() {
		saving = true;
		try {
			if (printerType === 'none') {
				await savePrinterSettings({ printerType: 'browser', paperWidth: '80', enabled: false });
				showToast('Struk tidak dicetak — struk tampil di layar.');
			} else {
				await savePrinterSettings({ printerType, paperWidth, agentUrl: printerType === 'agent' ? agentUrl : undefined, enabled: true });
				showToast('Pengaturan printer disimpan.');
			}
			open = false;
		} catch {
			showToast('Gagal menyimpan pengaturan printer.');
		} finally {
			saving = false;
		}
	}

	async function chooseOption(id: PrinterType | 'none') {
		// Pilih "Tidak mencetak struk" = langsung simpan & tutup, tanpa langkah lagi.
		if (id === 'none') {
			await savePrinterSettings({ printerType: 'browser', paperWidth: '80', enabled: false });
			showToast('Struk tidak dicetak — struk tampil di layar.');
			open = false;
			return;
		}
		printerType = id;
	}

	async function later() {
		// Simpan pilihan "nanti saja" agar wizard tidak muncul terus-menerus.
		await dismissPrinterSetup();
		showToast('Bisa diatur kapan saja dari menu Pengaturan.');
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" role="presentation">
		<div class="modal-card modal-wide" role="dialog" aria-modal="true" aria-label="Setup printer struk">
			<div class="modal-head">
				<h3>Setup printer struk</h3>
				<button class="icon-button" type="button" onclick={later} aria-label="Tutup dialog">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<div class="modal-body">
				<p class="setup-intro">
					Hubungkan mesin cetak struk ke kasir ini, atau pilih tidak mencetak. Pengaturan disimpan per toko dan bisa diubah kapan saja dari menu Pengaturan.
				</p>

				{#if step === 'choose'}
					<div class="setup-options">
						{#each options as opt}
							<button class="setup-option" class:active={printerType === opt.id} type="button" onclick={() => chooseOption(opt.id)}>
								<span class="radio-dot" class:active={printerType === opt.id}></span>
								<span class="setup-option-copy">
									<strong>{opt.label}</strong>
									<small>{opt.desc}</small>
								</span>
							</button>
						{/each}
					</div>

					{#if printerType !== 'none'}
						<div class="setup-fields">
							<label class="setup-field">
								<span>Lebar kertas struk</span>
								<select bind:value={paperWidth}>
									<option value="80">80 mm</option>
									<option value="58">58 mm</option>
								</select>
							</label>
							{#if printerType === 'agent'}
								<label class="setup-field">
									<span>Alamat agen cetak (di PC kasir)</span>
									<input type="text" bind:value={agentUrl} placeholder="http://127.0.0.1:9123" />
								</label>
							{/if}
						</div>
					{/if}
				{:else if step === 'test'}
					<div class="setup-test">
						<p>Cetak uji sedang dikirim ke printer…</p>
						{#if testing}
							<span class="paying-spinner" aria-hidden="true"></span>
						{/if}
					</div>
				{:else}
					<div class="success-box">
						<span class="toast-check">✓</span>
						<strong>Printer siap digunakan</strong>
						<p>{testResult}</p>
					</div>
				{/if}

				{#if testResult && step === 'choose'}
					<p class="auth-error">{testResult}</p>
				{/if}

				<div class="modal-actions">
					<button class="button button-secondary" type="button" onclick={later}>Nanti saja</button>
					{#if step === 'choose'}
						{#if printerType !== 'none'}
							<button class="button button-primary" type="button" onclick={runTest} disabled={testing}>
								{testing ? 'Mencetak…' : 'Cetak uji'}
							</button>
						{/if}
						<button class="button button-primary" type="button" onclick={save} disabled={saving}>
							{saving ? 'Menyimpan…' : printerType === 'none' ? 'Simpan pilihan' : 'Simpan pengaturan'}
						</button>
					{:else if step === 'test'}
						<button class="button button-primary" type="button" onclick={save} disabled={testing}>Simpan pengaturan</button>
					{:else}
						<button class="button button-primary" type="button" onclick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan pengaturan'}</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.setup-intro {
		margin: 0 0 14px;
		color: var(--ink-soft);
		font-size: 12px;
		line-height: 1.6;
	}

	.setup-options {
		display: grid;
		gap: 8px;
	}

	.setup-option {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: #fff;
		text-align: left;
		cursor: pointer;
		transition: border-color 160ms ease, background 160ms ease;
	}

	.setup-option:hover,
	.setup-option.active {
		border-color: var(--forest-700);
		background: #f5faf5;
	}

	.setup-option-copy {
		display: grid;
		gap: 3px;
	}

	.setup-option-copy strong {
		font-size: 13px;
	}

	.setup-option-copy small {
		color: var(--ink-soft);
		font-size: 11px;
		line-height: 1.5;
	}

	.setup-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 10px;
		margin-top: 14px;
	}

	.setup-field {
		display: grid;
		gap: 6px;
		font-size: 11px;
		font-weight: 600;
	}

	.setup-field input,
	.setup-field select {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		font-size: 13px;
		background: #fff;
	}

	.setup-test {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		color: var(--ink-soft);
		font-size: 12px;
	}

	.paying-spinner {
		width: 24px;
		height: 24px;
		border: 3px solid var(--line-strong);
		border-top-color: var(--forest-700);
		border-radius: 50%;
		animation: ps-spin 0.9s linear infinite;
	}

	@keyframes ps-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>