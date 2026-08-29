<script lang="ts">
	import AdminBreadcrumb from '$lib/components/AdminBreadcrumb.svelte';

	type Tab = 'landing' | 'plans' | 'vouchers';
	type Plan = { id: string; name: string; monthly_price: number; annual_price: number; is_active: boolean; features: unknown[] };
	type Voucher = {
		id: string;
		code: string;
		label: string;
		type: 'percent' | 'fixed';
		value: number;
		max_uses: number;
		used_count: number;
		valid_from: string | null;
		valid_until: string | null;
		is_active: boolean;
		created_at: string;
	};

	let activeTab = $state<Tab>('landing');
	let loading = $state(true);
	let saving = $state(false);
	let loadError = $state('');
	let error = $state('');
	let notice = $state('');

	// ===== Landing content =====
	let content = $state<{
		hero: { badge: string; title: string; subtitle: string; note: string; ctaPrimary: string; ctaSecondary: string };
		sections: {
			fitur: { kicker: string; title: string; desc: string };
			caraKerja: { kicker: string; title: string; desc: string };
			benefit: { kicker: string; title: string; desc: string };
			harga: { kicker: string; title: string; desc: string };
			testimoni: { kicker: string; title: string; desc: string };
			faq: { kicker: string; title: string; desc: string };
		};
		trust: { value: string; label: string }[];
		ctaBand: { title: string; subtitle: string; button: string };
		testimonials: { name: string; role: string; quote: string }[];
		faqs: { q: string; a: string }[];
	}>({
		hero: { badge: '', title: '', subtitle: '', note: '', ctaPrimary: '', ctaSecondary: '' },
		sections: {
			fitur: { kicker: '', title: '', desc: '' },
			caraKerja: { kicker: '', title: '', desc: '' },
			benefit: { kicker: '', title: '', desc: '' },
			harga: { kicker: '', title: '', desc: '' },
			testimoni: { kicker: '', title: '', desc: '' },
			faq: { kicker: '', title: '', desc: '' }
		},
		trust: [{ value: '', label: '' }],
		ctaBand: { title: '', subtitle: '', button: '' },
		testimonials: [{ name: '', role: '', quote: '' }],
		faqs: [{ q: '', a: '' }]
	});

	// ===== Plans =====
	let plans = $state<Plan[]>([]);

	// ===== Vouchers =====
	let vouchers = $state<Voucher[]>([]);
	let voucherForm = $state({ code: '', label: '', type: 'percent', value: 20, max_uses: 0, valid_until: '' });

	const formatIDR = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(n ?? 0)))}`;

	const sectionItems: { key: keyof typeof content.sections; label: string }[] = [
		{ key: 'fitur', label: 'Bagian Fitur' },
		{ key: 'caraKerja', label: 'Bagian Cara kerja' },
		{ key: 'benefit', label: 'Bagian HPP & laba' },
		{ key: 'harga', label: 'Bagian Harga' },
		{ key: 'testimoni', label: 'Bagian Testimoni' },
		{ key: 'faq', label: 'Bagian FAQ' }
	];

	async function api(path: string, init?: RequestInit) {
		const res = await fetch(path, {
			...init,
			headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
		});
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(json.message ?? `HTTP ${res.status}`);
		return json;
	}

	function switchTab(tab: Tab) {
		activeTab = tab;
		error = '';
		notice = '';
	}

	async function loadLanding() {
		const d = await api('/api/cms/landing');
		const c = d.content ?? {};
		const sec = (key: string) => {
			const s = c.sections?.[key] ?? {};
			return { kicker: s.kicker ?? '', title: s.title ?? '', desc: s.desc ?? '' };
		};
		content = {
			hero: {
				badge: c.hero?.badge ?? '',
				title: c.hero?.title ?? '',
				subtitle: c.hero?.subtitle ?? '',
				note: c.hero?.note ?? '',
				ctaPrimary: c.hero?.ctaPrimary ?? '',
				ctaSecondary: c.hero?.ctaSecondary ?? ''
			},
			sections: {
				fitur: sec('fitur'),
				caraKerja: sec('caraKerja'),
				benefit: sec('benefit'),
				harga: sec('harga'),
				testimoni: sec('testimoni'),
				faq: sec('faq')
			},
			trust: (c.trust ?? [{ value: '', label: '' }]).map((t: { value?: string; label?: string }) => ({
				value: t.value ?? '',
				label: t.label ?? ''
			})),
			ctaBand: {
				title: c.ctaBand?.title ?? '',
				subtitle: c.ctaBand?.subtitle ?? '',
				button: c.ctaBand?.button ?? ''
			},
			testimonials: (c.testimonials ?? [{ name: '', role: '', quote: '' }]).map(
				(t: { name?: string; role?: string; quote?: string }) => ({ name: t.name ?? '', role: t.role ?? '', quote: t.quote ?? '' })
			),
			faqs: (c.faqs ?? [{ q: '', a: '' }]).map((f: { q?: string; a?: string }) => ({ q: f.q ?? '', a: f.a ?? '' }))
		};
	}

	async function loadPlans() {
		const d = await api('/api/admin/plans');
		plans = d.plans ?? [];
	}

	async function loadVouchers() {
		const d = await api('/api/admin/vouchers');
		vouchers = d.vouchers ?? [];
	}

	$effect(() => {
		if (!loading) return;
		Promise.all([loadLanding(), loadPlans(), loadVouchers()])
			.then(() => (loading = false))
			.catch((e) => {
				loadError = e instanceof Error ? e.message : String(e);
				loading = false;
			});
	});

	async function saveLanding() {
		saving = true;
		error = '';
		notice = '';
		try {
			await api('/api/cms/landing', { method: 'PUT', body: JSON.stringify({ content }) });
			notice = 'Konten landing page disimpan.';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function savePlans() {
		saving = true;
		error = '';
		notice = '';
		try {
			await api('/api/admin/plans', {
				method: 'PUT',
				body: JSON.stringify({
					plans: plans.map((p) => ({ id: p.id, name: p.name, monthly_price: Number(p.monthly_price), annual_price: Number(p.annual_price), is_active: p.is_active }))
				})
			});
			notice = 'Harga paket diperbarui.';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function createVoucher() {
		saving = true;
		error = '';
		notice = '';
		try {
			await api('/api/admin/vouchers', {
				method: 'POST',
				body: JSON.stringify({
					code: voucherForm.code,
					label: voucherForm.label,
					type: voucherForm.type,
					value: Number(voucherForm.value),
					max_uses: Number(voucherForm.max_uses),
					valid_until: voucherForm.valid_until || null
				})
			});
			voucherForm = { code: '', label: '', type: 'percent', value: 20, max_uses: 0, valid_until: '' };
			await loadVouchers();
			notice = 'Voucher dibuat.';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function toggleVoucher(v: Voucher) {
		error = '';
		try {
			await api(`/api/admin/vouchers/${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !v.is_active }) });
			await loadVouchers();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function deleteVoucher(v: Voucher) {
		if (!confirm(`Hapus voucher ${v.code}?`)) return;
		error = '';
		try {
			await api(`/api/admin/vouchers/${v.id}`, { method: 'DELETE' });
			await loadVouchers();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function voucherStatus(v: Voucher): { label: string; cls: string } {
		if (!v.is_active) return { label: 'Nonaktif', cls: 'admin-status-expired' };
		if (v.valid_until && Date.parse(v.valid_until) < Date.now()) return { label: 'Kedaluwarsa', cls: 'admin-status-expired' };
		if (v.max_uses > 0 && v.used_count >= v.max_uses) return { label: 'Habis', cls: 'admin-status-pending' };
		return { label: 'Aktif', cls: 'admin-status-active' };
	}
</script>

<svelte:head><title>Konten &amp; Voucher — posspace admin</title></svelte:head>

<header class="admin-topbar">
	<div>
		<AdminBreadcrumb items={[{ label: 'Konten & Voucher' }]} />
		<h1>Konten &amp; Voucher</h1>
		<p class="admin-subtitle">Kelola tampilan landing page, harga paket, dan voucher diskon.</p>
	</div>
	<div class="admin-topbar-spacer"></div>
	{#if notice}
		<span style="color:var(--green);font-size:12px;font-weight:700">✓ {notice}</span>
	{/if}
</header>

<div class="admin-cms-tabs" role="tablist">
	<button type="button" class:active={activeTab === 'landing'} onclick={() => switchTab('landing')}>Landing page</button>
	<button type="button" class:active={activeTab === 'plans'} onclick={() => switchTab('plans')}>Paket &amp; harga</button>
	<button type="button" class:active={activeTab === 'vouchers'} onclick={() => switchTab('vouchers')}>Voucher diskon</button>
</div>

{#if loading}
	<div class="admin-loading">Memuat pengaturan...</div>
{:else if loadError}
	<div class="admin-panel"><div class="admin-empty">Gagal memuat: {loadError}</div></div>
{:else}
	{#if activeTab === 'landing'}
		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">BAGIAN ATAS</div>
					<h2>Hero &amp; CTA</h2>
				</div>
			</div>
			<div class="admin-cms-form">
				<label>Badge <input type="text" bind:value={content.hero.badge} placeholder="POS kasir untuk coffee shop UMKM" /></label>
				<label>Judul utama <input type="text" bind:value={content.hero.title} placeholder="Stok gudang selalu benar..." /></label>
				<label>Sub judul <textarea rows="2" bind:value={content.hero.subtitle} placeholder="Deskripsi singkat di bawah judul"></textarea></label>
				<label>Catatan kecil <input type="text" bind:value={content.hero.note} placeholder="Tanpa kartu kredit · Setup < 30 menit" /></label>
				<div class="admin-cms-row2">
					<label>Tombol utama <input type="text" bind:value={content.hero.ctaPrimary} placeholder="Mulai 14 hari gratis" /></label>
					<label>Tombol sekunder <input type="text" bind:value={content.hero.ctaSecondary} placeholder="Lihat demo kasir" /></label>
				</div>
				<label>Judul CTA bawah <input type="text" bind:value={content.ctaBand.title} placeholder="Siap membuat stok kopi Anda selalu benar?" /></label>
				<label>Sub CTA bawah <input type="text" bind:value={content.ctaBand.subtitle} placeholder="Mulai uji coba 14 hari gratis..." /></label>
				<label>Teks tombol CTA bawah <input type="text" bind:value={content.ctaBand.button} placeholder="Daftar sekarang" /></label>
			</div>
		</section>

		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">JUDUL BAGIAN</div>
					<h2>Copywriter tiap bagian halaman</h2>
				</div>
				<span class="admin-panel-note">Kosongkan untuk memakai teks bawaan.</span>
			</div>
			<div class="admin-cms-form">
				{#each sectionItems as s}
					<div class="admin-cms-card">
						<strong style="font-size:12px;color:var(--ink-soft)">{s.label}</strong>
						<div class="admin-cms-row2">
							<label>Kicker (label kecil) <input type="text" bind:value={content.sections[s.key].kicker} placeholder="FITUR LENGKAP" /></label>
							<label>Judul <input type="text" bind:value={content.sections[s.key].title} placeholder="Judul bagian" /></label>
						</div>
						<label>Deskripsi <textarea rows="2" bind:value={content.sections[s.key].desc} placeholder="Deskripsi bagian (opsional)"></textarea></label>
					</div>
				{/each}
			</div>
		</section>

		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">ANGKA KUNCI</div>
					<h2>Statistik kepercayaan</h2>
				</div>
			</div>
			<div class="admin-cms-form">
				{#each content.trust as t, i}
					<div class="admin-cms-row2">
						<label>Nilai <input type="text" bind:value={t.value} placeholder="120+" /></label>
						<label>Keterangan <input type="text" bind:value={t.label} placeholder="coffee shop aktif" /></label>
						<button type="button" class="admin-cms-remove" onclick={() => content.trust.splice(i, 1)} aria-label="Hapus">✕</button>
					</div>
				{/each}
				<button type="button" class="admin-cms-add" onclick={() => content.trust.push({ value: '', label: '' })}>+ Tambah angka kunci</button>
			</div>
		</section>

		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">TESTIMONI</div>
					<h2>Kata mereka</h2>
				</div>
			</div>
			<div class="admin-cms-form">
				{#each content.testimonials as t, i}
					<div class="admin-cms-card">
						<div class="admin-cms-row2">
							<label>Nama <input type="text" bind:value={t.name} placeholder="Rina" /></label>
							<label>Peran <input type="text" bind:value={t.role} placeholder="Kasir / Barista" /></label>
						</div>
						<label>Kutipan <textarea rows="2" bind:value={t.quote} placeholder="&quot;...&quot;"></textarea></label>
						<button type="button" class="admin-cms-remove" onclick={() => content.testimonials.splice(i, 1)}>✕ Hapus testimoni</button>
					</div>
				{/each}
				<button type="button" class="admin-cms-add" onclick={() => content.testimonials.push({ name: '', role: '', quote: '' })}>+ Tambah testimoni</button>
			</div>
		</section>

		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">FAQ</div>
					<h2>Pertanyaan umum</h2>
				</div>
			</div>
			<div class="admin-cms-form">
				{#each content.faqs as f, i}
					<div class="admin-cms-card">
						<label>Pertanyaan <input type="text" bind:value={f.q} placeholder="Apakah stok berkurang otomatis?" /></label>
						<label>Jawaban <textarea rows="2" bind:value={f.a} placeholder="Ya..."></textarea></label>
						<button type="button" class="admin-cms-remove" onclick={() => content.faqs.splice(i, 1)}>✕ Hapus FAQ</button>
					</div>
				{/each}
				<button type="button" class="admin-cms-add" onclick={() => content.faqs.push({ q: '', a: '' })}>+ Tambah FAQ</button>
			</div>
		</section>

		{#if error}
			<p class="au-error" style="margin:0 0 10px">{error}</p>
		{/if}
		<button class="admin-cms-save" type="button" onclick={saveLanding} disabled={saving}>
			{saving ? 'Menyimpan...' : 'Simpan konten landing'}
		</button>

	{:else if activeTab === 'plans'}
		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">PAKET LANGGANAN</div>
					<h2>Nama &amp; harga paket</h2>
				</div>
				<span class="admin-panel-note">Harga dipakai di halaman beranda, pendaftaran, dan pembuatan invoice.</span>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Paket</th>
							<th class="num">Bulanan (Rp)</th>
							<th class="num">Tahunan/bulan (Rp)</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each plans as p}
							<tr>
								<td>
									<input type="text" bind:value={p.name} style="width:130px;padding:7px 9px;border:1px solid var(--line-strong);border-radius:8px;font-size:12px" />
								</td>
								<td>
									<input type="number" min="0" step="1000" bind:value={p.monthly_price} style="width:110px;padding:7px 9px;border:1px solid var(--line-strong);border-radius:8px;font-size:12px;text-align:right" />
								</td>
								<td>
									<input type="number" min="0" step="1000" bind:value={p.annual_price} style="width:110px;padding:7px 9px;border:1px solid var(--line-strong);border-radius:8px;font-size:12px;text-align:right" />
								</td>
								<td>
									<label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer">
										<input type="checkbox" bind:checked={p.is_active} />
										{p.is_active ? 'Aktif' : 'Nonaktif'}
									</label>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if error}
				<p class="au-error" style="margin:10px 0 0">{error}</p>
			{/if}
			<button class="admin-cms-save" type="button" onclick={savePlans} disabled={saving}>
				{saving ? 'Menyimpan...' : 'Simpan harga paket'}
			</button>
		</section>

	{:else}
		<section class="admin-panel" style="margin-bottom:16px">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">VOUCHER BARU</div>
					<h2>Buat voucher diskon</h2>
				</div>
			</div>
			<div class="admin-cms-form">
				<div class="admin-cms-row2">
					<label>Kode <input type="text" bind:value={voucherForm.code} placeholder="HEMAT20" style="text-transform:uppercase" /></label>
					<label>Label <input type="text" bind:value={voucherForm.label} placeholder="Diskon 20% pelanggan baru" /></label>
				</div>
				<div class="admin-cms-row2">
					<label>
						Jenis diskon
						<select bind:value={voucherForm.type}>
							<option value="percent">Persen (%)</option>
							<option value="fixed">Nominal (Rp)</option>
						</select>
					</label>
					<label>Nilai <input type="number" min="1" step="1" bind:value={voucherForm.value} placeholder="20" /></label>
				</div>
				<div class="admin-cms-row2">
					<label>Batas pemakaian <input type="number" min="0" step="1" bind:value={voucherForm.max_uses} placeholder="0 = tanpa batas" /></label>
					<label>Berlaku sampai <input type="date" bind:value={voucherForm.valid_until} /></label>
				</div>
				{#if error}
					<p class="au-error" style="margin:0">{error}</p>
				{/if}
				<button class="admin-cms-save" type="button" onclick={createVoucher} disabled={saving}>
					{saving ? 'Membuat...' : '+ Buat voucher'}
				</button>
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel-head">
				<div>
					<div class="admin-panel-kicker">DAFTAR VOUCHER</div>
					<h2>{vouchers.length} voucher</h2>
				</div>
			</div>
			<div style="overflow-x:auto">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Kode</th>
							<th>Label</th>
							<th class="num">Diskon</th>
							<th class="num">Pemakaian</th>
							<th>Status</th>
							<th>Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each vouchers as v}
							<tr>
								<td><strong>{v.code}</strong></td>
								<td>{v.label}</td>
								<td class="num">{v.type === 'percent' ? `${v.value}%` : formatIDR(v.value)}</td>
								<td class="num">{v.used_count}{v.max_uses > 0 ? ` / ${v.max_uses}` : ''}</td>
								<td><span class="admin-status {voucherStatus(v).cls}">{voucherStatus(v).label}</span></td>
								<td>
									<div style="display:flex;gap:6px">
										<button class="admin-cms-mini" type="button" onclick={() => toggleVoucher(v)}>{v.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
										<button class="admin-cms-mini danger" type="button" onclick={() => deleteVoucher(v)}>Hapus</button>
									</div>
								</td>
							</tr>
						{:else}
							<tr><td colspan="6"><div class="admin-empty">Belum ada voucher.</div></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if error}
				<p class="au-error" style="margin:10px 0 0">{error}</p>
			{/if}
		</section>
	{/if}
{/if}

<style>
	.admin-cms-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 18px;
	}

	.admin-cms-tabs button {
		padding: 9px 16px;
		color: var(--ink-soft);
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--surface);
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.admin-cms-tabs button.active {
		color: #fff;
		border-color: var(--forest-700);
		background: var(--forest-700);
	}

	.admin-cms-form {
		display: grid;
		gap: 12px;
	}

	.admin-cms-form label {
		display: grid;
		gap: 5px;
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
	}

	.admin-cms-form input,
	.admin-cms-form textarea,
	.admin-cms-form select {
		width: 100%;
		padding: 9px 11px;
		color: var(--ink);
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: #fbfbf9;
		font-size: 12.5px;
	}

	.admin-cms-form textarea {
		resize: vertical;
	}

	.admin-cms-row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		align-items: end;
	}

	.admin-cms-card {
		position: relative;
		display: grid;
		gap: 10px;
		padding: 14px;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		background: #fcfcf9;
	}

	.admin-cms-remove {
		justify-self: start;
		padding: 6px 10px;
		color: var(--red);
		border: 1px solid #f1d4cf;
		border-radius: 8px;
		background: var(--red-soft);
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}

	.admin-cms-add {
		justify-self: start;
		padding: 8px 13px;
		color: var(--forest-700);
		border: 1px dashed var(--forest-100);
		border-radius: 9px;
		background: var(--forest-100);
		font-size: 11.5px;
		font-weight: 700;
		cursor: pointer;
	}

	.admin-cms-save {
		padding: 11px 22px;
		color: #fff;
		border: 0;
		border-radius: 11px;
		background: var(--forest-700);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.admin-cms-save:disabled {
		opacity: 0.55;
		cursor: wait;
	}

	.admin-cms-mini {
		padding: 5px 10px;
		color: var(--forest-700);
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--surface);
		font-size: 10.5px;
		font-weight: 700;
		cursor: pointer;
	}

	.admin-cms-mini.danger {
		color: var(--red);
		border-color: #f1d4cf;
		background: var(--red-soft);
	}

	@media (max-width: 720px) {
		.admin-cms-tabs {
			gap: 6px;
		}

		.admin-cms-tabs button {
			flex: 1 1 auto;
			padding: 8px 10px;
			font-size: 11px;
		}

		.admin-cms-row2 {
			grid-template-columns: 1fr;
		}

		.admin-cms-form input,
		.admin-cms-form textarea,
		.admin-cms-form select {
			font-size: 16px;
		}

		.admin-table input {
			font-size: 16px;
		}

		.admin-cms-card {
			padding: 12px 10px;
		}

		.admin-cms-save {
			width: 100%;
		}
	}
</style>