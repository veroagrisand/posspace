<script lang="ts">
	interface Crumb {
		label: string;
		href?: string;
	}

	let { items }: { items: Crumb[] } = $props();
</script>

<nav class="admin-breadcrumb" aria-label="Breadcrumb">
	<a href="/admin">Ringkasan</a>
	{#each items as item, i}
		<span class="bc-sep" aria-hidden="true">/</span>
		{#if item.href}
			<a href={item.href}>{item.label}</a>
		{:else}
			<span aria-current="page">{item.label}</span>
		{/if}
	{/each}
</nav>