<script lang="ts">
	let { title = '', open = $bindable(false), children, wide = false }: {
		title?: string;
		open?: boolean;
		children?: import('svelte').Snippet;
		wide?: boolean;
	} = $props();
</script>

{#if open}
	<div class="modal-overlay" role="presentation" onclick={(e) => {
		if (e.target === e.currentTarget) open = false;
	}}>
		<div class="modal-card" class:modal-wide={wide} role="dialog" aria-modal="true" aria-label={title}>
			<div class="modal-head">
				<h3>{title}</h3>
				<button class="icon-button" type="button" onclick={() => (open = false)} aria-label="Tutup dialog">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<div class="modal-body">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
