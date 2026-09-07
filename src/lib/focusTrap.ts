export interface FocusableOptions {
	/** Elemen yang boleh menerima fokus di dalam root (default: semua fokusable). */
	filter?: (el: HTMLElement) => boolean;
}

/** Elemen yang bisa menerima fokus di dalam root (terlihat, tidak disabled). */
export function getFocusable(root: HTMLElement): HTMLElement[] {
	const selector =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
	return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => el.getClientRects().length > 0);
}

/**
 * Svelte action: jaga fokus keyboard tetap di dalam dialog (Tab / Shift+Tab
 * berputar di antara elemen dialog). Pasang pada elemen role="dialog".
 */
export function trapFocus(node: HTMLElement) {
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const items = getFocusable(node);
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (e.shiftKey && (active === first || !node.contains(active))) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (active === last || !node.contains(active))) {
			e.preventDefault();
			first.focus();
		}
	}
	node.addEventListener('keydown', onKeydown);
	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
		}
	};
}

/** Pindahkan fokus ke elemen dialog agar screen reader & keyboard masuk dialog. */
export function focusDialog(node: HTMLElement) {
	if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
	node.focus();
}
