import { env } from '$env/dynamic/public';

export const businessContact = {
	name: 'posspace',
	email: env.PUBLIC_BUSINESS_EMAIL || 'info@posspace.id',
	phone: env.PUBLIC_BUSINESS_PHONE || '+62 812-3456-7890',
	address: env.PUBLIC_BUSINESS_ADDRESS || 'KOST.ON 3 Residence, Jalan Purawinata, Paledang, Lengkong, Kota Bandung 40261'
};

export const businessPhoneHref = `tel:${businessContact.phone.replace(/[^\d+]/g, '')}`;
export const businessMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessContact.address)}`;
