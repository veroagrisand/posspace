export const toastState: { message: string } = $state({ message: '' });

export function showToast(message: string) {
	toastState.message = message;
}
