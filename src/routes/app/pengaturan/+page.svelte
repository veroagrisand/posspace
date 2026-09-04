<script lang="ts">
	import { showToast } from '$lib/toast.svelte';
	import { store, saveShop, setMemberRole, backend } from '$lib/store.svelte';

	let name = $state(store.shop.name);
	let address = $state(store.shop.address);
	let phone = $state(store.shop.phone);
	let currency = $state(store.shop.currency);

	const roles = [
		{ id: 'kasir', label: 'Kasir / Barista', desc: 'Mencatat pesanan, pembayaran, dan shift' },
		{ id: 'admin_gudang', label: 'Admin Gudang', desc: 'Stok, pembelian, dan stock opname' },
		{ id: 'pemilik', label: 'Pemilik / Manajer', desc: 'Akses penuh termasuk laporan & pengaturan' }
	];

	let addMemberOpen = $state(false);
	let addName = $state('');
	let addEmail = $state('');
	let addRole = $state('kasir');

	async function saveShopData() {
		await saveShop({
			name: name.trim() || store.shop.name,
			address: address.trim(),
			phone: phone.trim(),
			currency
		});
		showToast('Profil toko disimpan');
	}

	async function setRole(id: string, role: string) {
		const profile = store.profiles.find((p) => p.id === id);
		if (!profile) return;
		await setMemberRole(id, role);
		showToast(`Hak akses ${profile.name} diubah menjadi ${roles.find((r) => r.id === role)?.label}`);
	}

	async function addMember() {
		if (!addName.trim() || !addEmail.trim()) return;
		if (backend.enabled) {
			const res = await fetch('/api/shop/members', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: addName.trim(), email: addEmail.trim(), role: addRole })
			});
			const result = (await res.json().catch(() => ({}))) as { ok?: boolean; tempPassword?: string };
			if (!res.ok || !result.ok) {
				showToast('Gagal mengundang anggota (email mungkin sudah terdaftar)');
				return;
			}
			showToast(`Anggota diundang. Password sementara: ${result.tempPassword}`);
		} else {
			store.profiles.push({ id: `u-${Date.now()}`, name: addName.trim(), email: addEmail.trim(), role: addRole });
			showToast('Anggota baru ditambahkan (mode demo)');
		}
		addMemberOpen = false;
		addName = '';
		addEmail = '';
	}

	function roleLabel(role: string) {
		return roles.find((r) => r.id === role)?.label ?? role;
	}
</script>

<header class="topbar">
	<div class="breadcrumbs" aria-label="Breadcrumb">
		<span>Operasional</span>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
		<strong>Pengaturan</strong>
	</div>
</header>

<div class="page-content">
	<section class="page-heading">
		<div>
			<div class="eyebrow"><span class="eyebrow-line"></span> FASE 4 — AKUN &amp; PENGATURAN</div>
			<h1>Profil toko &amp; hak akses.</h1>
			<p>Atur identitas toko, mata uang struk, dan peran anggota tim.</p>
		</div>
		<div class="heading-actions">
			<span class="lp-footer-demo" style="display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border-radius:9px;background:#fff;border:1px solid var(--line-strong);font-size:10px">
				<i style="width:6px;height:6px;border-radius:50%;background:var(--amber)"></i>
				Paket {backend.subscription?.planName ?? '—'} · {store.shop.currency}
			</span>
		</div>
	</section>

	<section class="panel" style="padding: 24px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">PROFIL TOKO</div><h2>Identitas yang tampil di struk</h2></div>
		</div>
		<div class="form-grid" style="max-width:560px">
			<div class="form-row">
				<label for="shopName">Nama toko</label>
				<div class="form-input"><input id="shopName" type="text" bind:value={name} /></div>
			</div>
			<div class="form-row">
				<label for="shopAddress">Alamat</label>
				<div class="form-input"><input id="shopAddress" type="text" bind:value={address} /></div>
			</div>
			<div class="form-grid two">
				<div class="form-row">
					<label for="shopPhone">Telepon</label>
					<div class="form-input"><input id="shopPhone" type="text" bind:value={phone} /></div>
				</div>
				<div class="form-row">
					<label for="shopCurrency">Mata uang</label>
					<div class="form-input">
						<select id="shopCurrency" bind:value={currency}>
							<option value="IDR">IDR — Rupiah (Rp)</option>
							<option value="USD">USD — Dollar ($)</option>
							<option value="MYR">MYR — Ringgit (RM)</option>
							<option value="SGD">SGD — Dollar Singapura (S$)</option>
						</select>
					</div>
				</div>
			</div>
		</div>
		<div style="margin-top:18px">
			<button class="button button-primary" type="button" onclick={saveShopData}>Simpan profil</button>
		</div>
	</section>

	<section class="panel" style="padding: 24px;margin-top: 19px">
		<div class="panel-heading compact-heading" style="margin-bottom: 18px">
			<div><div class="section-kicker">ATUR HAK AKSES</div><h2>Anggota tim &amp; peran</h2></div>
			<button class="button button-secondary" type="button" onclick={() => (addMemberOpen = true)}>+ Undang anggota</button>
		</div>
		<div style="overflow-x:auto">
			<table class="data-table">
				<thead>
					<tr>
						<th>Nama</th>
						<th>Email</th>
						<th>Peran</th>
					</tr>
				</thead>
				<tbody>
					{#each store.profiles as profile}
						<tr>
							<td>{profile.name}</td>
							<td>{profile.email}</td>
							<td>
								<div class="form-input" style="height:36px;min-width:210px">
									<select value={profile.role} onchange={(e) => setRole(profile.id, (e.currentTarget as HTMLSelectElement).value)}>
										{#each roles as role}
											<option value={role.id} disabled={profile.role === 'pemilik' && role.id !== 'pemilik'}>{role.label}</option>
										{/each}
									</select>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div style="display:grid;gap:8px;margin-top:18px;max-width:560px">
			{#each roles as role}
				<div class="au-demo-note" style="margin-top:0">
					<span style="font-weight:700;min-width:140px">{role.label}</span>
					<span style="color:#718078">{role.desc}</span>
				</div>
			{/each}
		</div>
	</section>
</div>

{#if addMemberOpen}
	<div class="modal-overlay" role="presentation" onclick={(e) => {
		if (e.target === e.currentTarget) addMemberOpen = false;
	}}>
		<div class="modal-card" role="dialog" aria-modal="true" aria-label="Undang anggota">
			<div class="modal-head">
				<h3>Undang anggota tim</h3>
				<button class="icon-button" type="button" onclick={() => (addMemberOpen = false)} aria-label="Tutup dialog">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<div class="modal-body">
				<div class="form-grid">
					<div class="form-row">
						<label for="addMemberName">Nama lengkap</label>
						<div class="form-input"><input id="addMemberName" type="text" bind:value={addName} placeholder="cth. Rina Anjani" /></div>
					</div>
					<div class="form-row">
						<label for="addMemberEmail">Email</label>
						<div class="form-input"><input id="addMemberEmail" type="email" bind:value={addEmail} placeholder="nama@posspace.id" /></div>
					</div>
					<div class="form-row">
						<label for="addMemberRole">Peran</label>
						<div class="form-input">
							<select id="addMemberRole" bind:value={addRole}>
								{#each roles as role}
									<option value={role.id}>{role.label}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
				<div class="modal-actions">
					<button class="button button-secondary" type="button" onclick={() => (addMemberOpen = false)}>Batal</button>
					<button class="button button-primary" type="button" onclick={addMember}>Kirim undangan</button>
				</div>
			</div>
		</div>
	</div>
{/if}
