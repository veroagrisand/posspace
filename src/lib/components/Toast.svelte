<script lang="ts">
	import { onMount } from 'svelte';

	let { message = '' }: { message: string } = $props();
	let visible = $state(false);
	let timer: number | undefined;

	onMount(() => {
		return () => window.clearTimeout(timer);
	});

	$effect(() => {
		if (!message) return;
		visible = true;
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			visible = false;
		}, 3000);
	});
</script>

<div class="toast" class:show={visible} role="status" aria-live="polite">
	<span class="toast-check">✓</span>
	<span>{message}</span>
</div>
