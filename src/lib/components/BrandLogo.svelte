<script lang="ts">
	export let variant: 'light' | 'dark' = 'light';
	export let size: 'sm' | 'md' = 'md';
</script>

<a
	class="brand lp-logo"
	class:brand-dark={variant === 'dark'}
	class:brand-sm={size === 'sm'}
	href={variant === 'light' ? '/' : '/app'}
	aria-label="posspace"
>
	<span class="brand-mark" aria-hidden="true">ps</span>
	<span class="brand-copy">
		<strong>pos</strong><small>space</small>
	</span>
</a>

<style>
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 11px;
		width: max-content;
	}

	.brand-sm .brand-mark {
		width: 30px;
		height: 30px;
		font-size: 12px;
	}

	.brand-copy {
		display: flex;
		align-items: baseline;
		gap: 4px;
		letter-spacing: -0.04em;
	}

	.brand-copy strong {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
	}

	.brand-sm .brand-copy strong {
		font-size: 19px;
	}

	.brand-copy small {
		color: var(--orange-dark);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.brand-dark .brand-copy strong {
		color: #fff;
	}

	.brand-dark .brand-copy small {
		color: #b8c8b8;
	}
</style>
