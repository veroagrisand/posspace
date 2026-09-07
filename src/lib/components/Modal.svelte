<script lang="ts">
	import { trapFocus } from '$lib/focusTrap';

	let { title = '', open = $bindable(false), children, wide = false }: {
		title?: string;
		open?: boolean;
		children?: import('svelte').Snippet;
		wide?: boolean;
	} = $props();

	let dialogEl = $state<HTMLElement | null>(null);
	let lastFocused: HTMLElement | null = null;

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
			open = false;
		}
	}
</script>

{#if open}
	<div class="modal-overlay" role="presentation" onclick={(e) => {
		if (e.target === e.currentTarget) open = false;
	}}>
		<div
			class="modal-card"
			class:modal-wide={wide}
			role="dialog" tabindex="-1"
			aria-modal="true"
			aria-label={title}
			bind:this={dialogEl}
			onkeydown={onKeydown}
			use:trapFocus
		>
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
