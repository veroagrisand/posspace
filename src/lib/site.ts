import { env } from '$env/dynamic/public';

// Fallback eksplisit berbentuk placeholder: jika variabel belum diisi di .env,
// situs tidak menampilkan nomor/alamat rekaan sebagai data nyata.
export const businessContact = {
	name: 'posspace',
	email: env.PUBLIC_BUSINESS_EMAIL || 'info@posspace.id',
	phone: env.PUBLIC_BUSINESS_PHONE || '08XX-XXXX-XXXX',
	address: env.PUBLIC_BUSINESS_ADDRESS || 'Alamat usaha Anda (isi PUBLIC_BUSINESS_ADDRESS di .env)'
};

export const businessPhoneHref = `tel:${businessContact.phone.replace(/[^\d+]/g, '')}`;
export const businessMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessContact.address)}`;