import nodemailer from 'nodemailer';
import { env } from './env.js';

/**
 * Email via SMTP Hostinger (smtp.hostinger.com).
 * Konfigurasi di .env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */
export const isSmtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
	if (!isSmtpConfigured) return null;
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: env.SMTP_HOST,
			port: Number(env.SMTP_PORT ?? 465),
			secure: env.SMTP_SECURE !== 'false', // 465 → SSL; 587 → STARTTLS
			auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
			connectionTimeout: 15_000,
			socketTimeout: 15_000
		});
	}
	return transporter;
}

export async function sendMail(input: {
	to: string;
	subject: string;
	html: string;
	text?: string;
}): Promise<void> {
	const t = getTransporter();
	if (!t) throw new Error('SMTP_NOT_CONFIGURED');
	await t.sendMail({
		from: env.SMTP_FROM ?? env.SMTP_USER,
		to: input.to,
		subject: input.subject,
		html: input.html,
		text: input.text
	});
}