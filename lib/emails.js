// ═══════════════════════════════════════════════════════════════
// MÓDULO DE ENVÍO DE EMAILS — SPLENDORA
// ═══════════════════════════════════════════════════════════════
// Usa Resend API. Si falla, NO interrumpe el flujo del pedido.
// ═══════════════════════════════════════════════════════════════

import { confirmationEmailHtml, shippedEmailHtml } from './email-templates';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'SPLENDORA <pedidos@splendoracol.site>';
const REPLY_TO = 'splendora.col@gmail.com';
const BCC_EMAIL = 'splendora.col@gmail.com'; // copia oculta a SPLENDORA

/**
 * Envía un email genérico vía Resend.
 * Retorna { success: bool, id?: string, error?: string }
 * NUNCA lanza excepciones — si falla, retorna error pero no rompe.
 */
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY no configurada, omitiendo envío');
    return { success: false, error: 'No API key' };
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn('[Email] Email destinatario inválido:', to);
    return { success: false, error: 'Email inválido' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        bcc: BCC_EMAIL ? [BCC_EMAIL] : undefined,
        reply_to: REPLY_TO,
        subject: subject,
        html: html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Email] Resend rechazó el envío:', data);
      return { success: false, error: data.message || 'Error desconocido' };
    }

    console.log(`[Email] Enviado a ${to} (id=${data.id})`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[Email] Error de red:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Envía email de confirmación de compra (cuando MP confirma el pago).
 * NO lanza excepciones.
 */
export async function sendConfirmationEmail({ orderNumber, customerName, customerEmail, items, total, address, city, phone }) {
  if (!customerEmail) {
    console.warn('[Email] sin email del cliente, omitiendo confirmación');
    return { success: false, error: 'Sin email' };
  }
  const html = confirmationEmailHtml({
    orderNumber,
    customerName,
    items,
    total,
    address,
    city,
    phone,
  });
  return await sendEmail({
    to: customerEmail,
    subject: `Pedido #${orderNumber} confirmado · SPLENDORA`,
    html,
  });
}

/**
 * Envía email de pedido enviado (cuando admin marca "Enviado").
 * NO lanza excepciones.
 */
export async function sendShippedEmail({ orderNumber, customerName, customerEmail, items, trackingNumber, carrier }) {
  if (!customerEmail) {
    console.warn('[Email] sin email del cliente, omitiendo notificación de envío');
    return { success: false, error: 'Sin email' };
  }
  const html = shippedEmailHtml({
    orderNumber,
    customerName,
    items,
    trackingNumber,
    carrier,
  });
  return await sendEmail({
    to: customerEmail,
    subject: `Tu pedido #${orderNumber} está en camino · SPLENDORA`,
    html,
  });
}
