// ═══════════════════════════════════════════════════════════════
// TEMPLATES DE EMAILS — SPLENDORA (v2 — compatible móvil)
// ═══════════════════════════════════════════════════════════════
// Estilo minimalista femenino, inspirado en Lululemon / Bo & Tea
// Table-based layout para máxima compatibilidad con clientes email
// ═══════════════════════════════════════════════════════════════

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://splendoracol.site';
const LOGO_URL = `${BASE_URL}/splendora-logo.png`;
const WHATSAPP_URL = 'https://wa.me/573172346822';

function cur(n) {
  return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTrackingUrl(carrier) {
  const c = (carrier || '').toLowerCase();
  if (c.includes('inter')) return 'https://siguetuenvio.interrapidisimo.com/';
  if (c.includes('servientrega')) return 'https://www.servientrega.com/wps/portal/origen-de-carga/rastreo';
  if (c.includes('coordinadora')) return 'https://coordinadora.com/rastreo/';
  if (c.includes('tcc')) return 'https://tcc.com.co/rastreo';
  return 'https://www.google.com/search?q=' + encodeURIComponent('rastreo ' + (carrier || ''));
}

function renderItemsTable(items, showPrice) {
  return (items || []).map(it => {
    const photoUrl = it.photoUrl || '';
    const photoBox = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" width="80" style="width:80px; height:auto; border-radius:4px; display:block; max-width:80px;" />`
      : `<div style="background:#FDF2F8; width:80px; height:100px; border-radius:4px;"></div>`;

    return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-bottom:1px solid #F3E8EE;">
      <tr>
        <td valign="top" width="96" style="padding:16px 16px 16px 0;">${photoBox}</td>
        <td valign="top" style="padding:16px 0;">
          <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; font-weight:600; color:#1A1D23; margin-bottom:4px;">${escapeHtml(it.name)}</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#6B7280; line-height:1.6;">
            ${it.size ? `Talla: ${escapeHtml(it.size)}<br/>` : ''}
            ${it.color ? `Color: ${escapeHtml(it.color)}<br/>` : ''}
            Cantidad: ${it.qty}
          </div>
        </td>
        ${showPrice ? `<td valign="top" align="right" style="padding:16px 0; font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; font-weight:700; color:#1A1D23; white-space:nowrap;">${cur(it.subtotal || (it.priceUnit * it.qty))}</td>` : ''}
      </tr>
    </table>`;
  }).join('');
}

function emailShell(title, bodyHtml) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="format-detection" content="telephone=no"/>
<title>${escapeHtml(title)}</title>
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
  body { margin:0 !important; padding:0 !important; width:100% !important; background:#E5E7EB; }
  @media screen and (max-width: 600px) {
    .mobile-padding { padding:24px 20px !important; }
    .mobile-h1 { font-size:24px !important; line-height:1.3 !important; }
    .mobile-tracking { font-size:18px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:#E5E7EB; font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#E5E7EB;">
  <tr>
    <td align="center" style="padding:20px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%; max-width:600px; background:#FEFCFA;">
        <tr>
          <td align="center" class="mobile-padding" style="padding:48px 40px 32px; border-bottom:1px solid #F3E8EE;">
            <img src="${LOGO_URL}" alt="SPLENDORA" width="56" style="width:56px; height:auto; display:block; margin:0 auto 16px;"/>
            <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:26px; font-weight:600; letter-spacing:4px; color:#1A1D23;">SPLENDORA</div>
            <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; letter-spacing:6px; color:#6B7280; margin-top:6px; font-weight:500;">COL</div>
          </td>
        </tr>
        ${bodyHtml}
        <tr>
          <td align="center" class="mobile-padding" style="padding:32px 40px; border-top:1px solid #F3E8EE; background:#FAF8F5;">
            <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#6B7280; line-height:1.7;">
              ¿Necesitas ayuda?<br/>
              Escríbenos al WhatsApp <a href="${WHATSAPP_URL}" style="color:#1A1D23; text-decoration:none; font-weight:600;">+57 317 234 6822</a>
            </div>
            <div style="margin-top:20px; padding-top:20px; border-top:1px solid #F3E8EE; font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; letter-spacing:4px; color:#9CA3AF;">SPLENDORA</div>
            <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; color:#B0AFAA; letter-spacing:1px; margin-top:4px;">COL · Manizales, Colombia</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 1 — Confirmación de compra
// ═══════════════════════════════════════════════════════════════
export function confirmationEmailHtml({ orderNumber, customerName, items, total, address, city, phone }) {
  const firstName = (customerName || '').split(' ')[0] || 'Cliente';
  const itemsHtml = renderItemsTable(items, true);

  const body = `
    <tr>
      <td class="mobile-padding" style="padding:40px;">
        <div style="display:inline-block; background:#FDF2F8; color:#C0506F; padding:6px 14px; border-radius:100px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; margin-bottom:16px;">PEDIDO #${orderNumber}</div>
        <h1 class="mobile-h1" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:28px; font-weight:500; line-height:1.3; margin:0 0 16px; color:#1A1D23;">Gracias por tu compra,<br/>${escapeHtml(firstName)}.</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#4B5563; line-height:1.7; margin:0 0 32px;">
          Recibimos tu pedido y comenzaremos a prepararlo con cariño. Te enviaremos otro correo cuando esté en camino con el número de guía para que puedas seguirlo.
        </p>

        <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; letter-spacing:2px; font-weight:700; color:#9CA3AF; text-transform:uppercase; margin:0 0 12px;">Tu pedido</div>
        ${itemsHtml}

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px; padding-top:20px; border-top:1px solid #F3E8EE;">
          <tr>
            <td style="font-family:'Helvetica Neue',Arial,sans-serif; padding:6px 0; font-size:13px; color:#6B7280;">Subtotal</td>
            <td align="right" style="font-family:'Helvetica Neue',Arial,sans-serif; padding:6px 0; font-size:13px;">${cur(total)}</td>
          </tr>
          <tr>
            <td style="font-family:'Helvetica Neue',Arial,sans-serif; padding:6px 0; font-size:13px; color:#6B7280;">Envío</td>
            <td align="right" style="font-family:'Helvetica Neue',Arial,sans-serif; padding:6px 0; font-size:13px;">Gratis</td>
          </tr>
          <tr>
            <td style="font-family:'Helvetica Neue',Arial,sans-serif; padding:14px 0 6px; border-top:1px solid #F3E8EE; font-size:16px; font-weight:700; color:#1A1D23;">Total</td>
            <td align="right" style="font-family:'Helvetica Neue',Arial,sans-serif; padding:14px 0 6px; border-top:1px solid #F3E8EE; font-size:16px; font-weight:700;">${cur(total)}</td>
          </tr>
        </table>

        <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; letter-spacing:2px; font-weight:700; color:#9CA3AF; text-transform:uppercase; margin:32px 0 12px;">Dirección de envío</div>
        <div style="background:#FAF8F5; padding:18px; border-radius:6px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; line-height:1.7; color:#4B5563;">
          <strong style="color:#1A1D23; display:block; margin-bottom:4px;">${escapeHtml(customerName)}</strong>
          ${escapeHtml(address || '')}<br/>
          ${escapeHtml(city || '')}<br/>
          ${escapeHtml(phone || '')}
        </div>

        <div style="background:#FDF2F8; padding:20px; border-radius:6px; margin-top:32px; text-align:center;">
          <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; color:#C0506F; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px;">Tiempo estimado</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#4B5563; line-height:1.6;">
            Tu pedido será enviado en 1 a 3 días hábiles.<br/>
            Entrega aproximada: <strong>3 a 8 días hábiles</strong>
          </div>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
          <tr>
            <td align="center">
              <a href="${WHATSAPP_URL}" style="display:block; padding:14px; background:transparent; color:#1A1D23 !important; text-decoration:none; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; border:1px solid #1A1D23; border-radius:4px; text-align:center;">¿Tienes dudas? Escríbenos</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return emailShell('Pedido confirmado', body);
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 2 — Pedido enviado
// ═══════════════════════════════════════════════════════════════
export function shippedEmailHtml({ orderNumber, customerName, items, trackingNumber, carrier }) {
  const trackingUrl = getTrackingUrl(carrier);
  const itemsHtml = renderItemsTable(items, false);
  const carrierLabel = carrier || 'Interrapidísimo';

  const body = `
    <tr>
      <td class="mobile-padding" style="padding:40px;">
        <div style="display:inline-block; background:#FDF2F8; color:#C0506F; padding:6px 14px; border-radius:100px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; margin-bottom:16px;">PEDIDO #${orderNumber}</div>
        <h1 class="mobile-h1" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:28px; font-weight:500; line-height:1.3; margin:0 0 16px; color:#1A1D23;">Tu pedido está<br/>en camino.</h1>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#4B5563; line-height:1.7; margin:0 0 32px;">
          Empacamos tu pedido con cariño y ya está rumbo a tu casa. Usa el número de guía para seguir su recorrido en tiempo real.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1A1D23; border-radius:8px; margin:0 0 16px;">
          <tr>
            <td align="center" style="padding:28px 24px;">
              <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#9CA3AF; margin-bottom:8px; font-weight:600;">Número de guía</div>
              <div class="mobile-tracking" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:22px; font-weight:700; letter-spacing:2px; color:#FFFFFF; margin-bottom:6px; word-break:break-all;">${escapeHtml(trackingNumber || '')}</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#D1D5DB;">${escapeHtml(carrierLabel)}</div>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td align="center">
              <a href="${trackingUrl}" target="_blank" style="display:block; padding:16px; background:#1A1D23; color:#FFFFFF !important; text-decoration:none; font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; font-weight:600; letter-spacing:2px; text-transform:uppercase; border-radius:4px; text-align:center;">Rastrear pedido</a>
            </td>
          </tr>
        </table>
        <p style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; color:#9CA3AF; text-align:center; margin:8px 0 0;">Ingresa el número de guía en el sitio de ${escapeHtml(carrierLabel)}.</p>

        <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; letter-spacing:2px; font-weight:700; color:#9CA3AF; text-transform:uppercase; margin:32px 0 12px;">Detalles del envío</div>
        ${itemsHtml}

        <div style="background:#FDF2F8; padding:20px; border-radius:6px; margin-top:32px; text-align:center;">
          <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; color:#C0506F; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px;">Llegada estimada</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; color:#4B5563; line-height:1.6;">
            <strong>3 a 8 días hábiles</strong><br/>
            Te avisaremos cuando llegue a destino
          </div>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
          <tr>
            <td align="center">
              <a href="${WHATSAPP_URL}" style="display:block; padding:14px; background:transparent; color:#1A1D23 !important; text-decoration:none; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; border:1px solid #1A1D23; border-radius:4px; text-align:center;">¿Necesitas ayuda?</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return emailShell('Tu pedido está en camino', body);
}
