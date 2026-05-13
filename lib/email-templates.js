// ═══════════════════════════════════════════════════════════════
// TEMPLATES DE EMAILS — SPLENDORA
// ═══════════════════════════════════════════════════════════════
// Estilo minimalista femenino, inspirado en Lululemon / Bo & Tea
// ═══════════════════════════════════════════════════════════════

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://splendoracol.site';
const LOGO_URL = `${BASE_URL}/splendora-logo.png`;
const WHATSAPP_URL = 'https://wa.me/573172346822';

// Formato de moneda colombiana
function cur(n) {
  return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

// Detecta empresa de envío y devuelve link de tracking
function getTrackingUrl(carrier, trackingNumber) {
  if (!trackingNumber) return null;
  const c = (carrier || '').toLowerCase();
  if (c.includes('interrapidisimo') || c.includes('inter')) {
    return `https://www.interrapidisimo.com/sigue-tu-envio/?guia=${trackingNumber}`;
  }
  if (c.includes('servientrega')) {
    return `https://www.servientrega.com/wps/portal/rastreo-envio?guia=${trackingNumber}`;
  }
  if (c.includes('coordinadora')) {
    return `https://coordinadora.com/rastreo/?guia=${trackingNumber}`;
  }
  if (c.includes('tcc')) {
    return `https://tcc.com.co/rastreo?guia=${trackingNumber}`;
  }
  // Fallback: búsqueda en Google
  return `https://www.google.com/search?q=rastreo+${encodeURIComponent(carrier || '')}+${trackingNumber}`;
}

// ═══════════════════════════════════════════════════════════════
// CSS reutilizable para los emails (inline para compatibilidad)
// ═══════════════════════════════════════════════════════════════
const EMAIL_BASE_STYLES = `
  body { margin: 0; padding: 0; background: #E5E7EB; font-family: 'Montserrat', 'Helvetica Neue', Arial, sans-serif; color: #1A1D23; }
  .wrap { max-width: 580px; margin: 0 auto; background: #FEFCFA; }
  .header { padding: 48px 40px 32px; text-align: center; border-bottom: 1px solid #F3E8EE; }
  .logo-img { max-width: 60px; height: auto; margin: 0 auto 16px; display: block; }
  .logo-text { font-size: 26px; font-weight: 600; letter-spacing: 4px; color: #1A1D23; margin: 0; }
  .logo-sub { font-size: 9px; letter-spacing: 6px; color: #6B7280; margin-top: 6px; font-weight: 500; }
  .body { padding: 40px; }
  .badge { display: inline-block; background: #FDF2F8; color: #C0506F; padding: 6px 14px; border-radius: 100px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; margin-bottom: 12px; }
  .h1 { font-size: 28px; font-weight: 500; line-height: 1.3; margin: 0 0 16px; color: #1A1D23; }
  .intro { font-size: 14px; color: #4B5563; line-height: 1.7; margin-bottom: 32px; }
  .section-title { font-size: 10px; letter-spacing: 2px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; margin: 32px 0 12px; }
  .product-row { display: table; width: 100%; padding: 16px 0; border-bottom: 1px solid #F3E8EE; }
  .product-cell { display: table-cell; vertical-align: top; }
  .product-img { width: 80px; height: 100px; border-radius: 4px; }
  .product-info { padding-left: 16px; }
  .product-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; color: #1A1D23; }
  .product-meta { font-size: 12px; color: #6B7280; line-height: 1.6; }
  .product-price { text-align: right; font-size: 14px; font-weight: 700; }
  .totals { margin-top: 20px; padding-top: 20px; border-top: 1px solid #F3E8EE; }
  .total-row { display: table; width: 100%; padding: 6px 0; font-size: 13px; }
  .total-cell-left { display: table-cell; color: #6B7280; }
  .total-cell-right { display: table-cell; text-align: right; }
  .total-final { font-size: 16px; font-weight: 700; margin-top: 8px; padding-top: 14px; border-top: 1px solid #F3E8EE; }
  .address-card { background: #FAF8F5; padding: 18px; border-radius: 6px; font-size: 13px; line-height: 1.7; color: #4B5563; margin-top: 12px; }
  .address-card strong { color: #1A1D23; display: block; margin-bottom: 4px; }
  .cta-btn { display: block; background: #1A1D23; color: white !important; text-align: center; padding: 16px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-top: 32px; border-radius: 4px; }
  .cta-secondary { display: block; background: transparent; color: #1A1D23 !important; text-align: center; padding: 14px; text-decoration: none; font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 12px; border: 1px solid #1A1D23; border-radius: 4px; }
  .info-box { background: #FDF2F8; padding: 20px; border-radius: 6px; margin-top: 32px; text-align: center; }
  .info-box-title { font-size: 12px; font-weight: 700; color: #C0506F; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
  .info-box-text { font-size: 13px; color: #4B5563; line-height: 1.6; }
  .tracking-card { background: #1A1D23; color: white; padding: 28px 24px; border-radius: 8px; text-align: center; margin: 24px 0; }
  .tracking-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #9CA3AF; margin-bottom: 8px; font-weight: 600; }
  .tracking-number { font-size: 22px; font-weight: 700; letter-spacing: 2px; margin-bottom: 4px; color: white; }
  .tracking-company { font-size: 12px; color: #D1D5DB; }
  .footer { padding: 32px 40px; text-align: center; border-top: 1px solid #F3E8EE; background: #FAF8F5; }
  .footer-help { font-size: 12px; color: #6B7280; line-height: 1.7; }
  .footer-help a { color: #1A1D23; text-decoration: none; font-weight: 600; }
  .footer-logo { margin-top: 20px; padding-top: 20px; border-top: 1px solid #F3E8EE; font-size: 14px; letter-spacing: 4px; color: #9CA3AF; }
  .footer-mini { font-size: 10px; color: #B0AFAA; letter-spacing: 1px; margin-top: 4px; }
`;

// ═══════════════════════════════════════════════════════════════
// EMAIL 1 — Confirmación de compra
// ═══════════════════════════════════════════════════════════════
export function confirmationEmailHtml({ orderNumber, customerName, items, total, address, city, phone }) {
  const firstName = (customerName || '').split(' ')[0] || 'Cliente';
  const itemsHtml = (items || []).map(it => `
    <div class="product-row">
      <div class="product-cell" style="width: 96px;">
        <div class="product-img" style="background: linear-gradient(135deg, #FDF2F8, #FAF8F5); width: 80px; height: 100px; border-radius: 4px;"></div>
      </div>
      <div class="product-cell product-info">
        <div class="product-name">${escapeHtml(it.name)}</div>
        <div class="product-meta">
          ${it.size ? `Talla: ${escapeHtml(it.size)}<br/>` : ''}
          ${it.color ? `Color: ${escapeHtml(it.color)}<br/>` : ''}
          Cantidad: ${it.qty}
        </div>
      </div>
      <div class="product-cell product-price" style="text-align: right;">${cur(it.subtotal || (it.priceUnit * it.qty))}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirmación de tu pedido</title>
<style>${EMAIL_BASE_STYLES}</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <img src="${LOGO_URL}" alt="SPLENDORA" class="logo-img" />
    <div class="logo-text">SPLENDORA</div>
    <div class="logo-sub">COL</div>
  </div>
  <div class="body">
    <span class="badge">PEDIDO #${orderNumber}</span>
    <h1 class="h1">Gracias por tu compra,<br/>${escapeHtml(firstName)}.</h1>
    <p class="intro">
      Recibimos tu pedido y comenzaremos a prepararlo con cariño. Te enviaremos otro correo cuando esté en camino con el número de guía para que puedas seguirlo.
    </p>

    <div class="section-title">Tu pedido</div>
    ${itemsHtml}

    <div class="totals">
      <div class="total-row">
        <div class="total-cell-left">Subtotal</div>
        <div class="total-cell-right">${cur(total)}</div>
      </div>
      <div class="total-row">
        <div class="total-cell-left">Envío</div>
        <div class="total-cell-right">Gratis</div>
      </div>
      <div class="total-row total-final">
        <div class="total-cell-left" style="color: #1A1D23; font-weight: 700;">Total</div>
        <div class="total-cell-right">${cur(total)}</div>
      </div>
    </div>

    <div class="section-title">Dirección de envío</div>
    <div class="address-card">
      <strong>${escapeHtml(customerName)}</strong>
      ${escapeHtml(address || '')}<br/>
      ${escapeHtml(city || '')}<br/>
      ${escapeHtml(phone || '')}
    </div>

    <div class="info-box">
      <div class="info-box-title">Tiempo estimado</div>
      <div class="info-box-text">
        Tu pedido será enviado en 1 a 3 días hábiles.<br/>
        Entrega aproximada: <strong>3 a 8 días hábiles</strong>
      </div>
    </div>

    <a href="${WHATSAPP_URL}" class="cta-secondary">¿Tienes dudas? Escríbenos</a>
  </div>

  <div class="footer">
    <div class="footer-help">
      ¿Necesitas ayuda?<br/>
      Escríbenos al WhatsApp <a href="${WHATSAPP_URL}">+57 317 234 6822</a>
    </div>
    <div class="footer-logo">SPLENDORA</div>
    <div class="footer-mini">COL · Manizales, Colombia</div>
  </div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 2 — Pedido enviado
// ═══════════════════════════════════════════════════════════════
export function shippedEmailHtml({ orderNumber, customerName, items, trackingNumber, carrier }) {
  const firstName = (customerName || '').split(' ')[0] || 'Cliente';
  const trackingUrl = getTrackingUrl(carrier, trackingNumber);
  const itemsHtml = (items || []).map(it => `
    <div class="product-row">
      <div class="product-cell" style="width: 96px;">
        <div class="product-img" style="background: linear-gradient(135deg, #FDF2F8, #FAF8F5); width: 80px; height: 100px; border-radius: 4px;"></div>
      </div>
      <div class="product-cell product-info">
        <div class="product-name">${escapeHtml(it.name)}</div>
        <div class="product-meta">
          ${it.size ? `Talla: ${escapeHtml(it.size)}<br/>` : ''}
          ${it.color ? `Color: ${escapeHtml(it.color)}<br/>` : ''}
          Cantidad: ${it.qty}
        </div>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tu pedido está en camino</title>
<style>${EMAIL_BASE_STYLES}</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <img src="${LOGO_URL}" alt="SPLENDORA" class="logo-img" />
    <div class="logo-text">SPLENDORA</div>
    <div class="logo-sub">COL</div>
  </div>
  <div class="body">
    <span class="badge">PEDIDO #${orderNumber}</span>
    <h1 class="h1">Tu pedido está<br/>en camino.</h1>
    <p class="intro">
      Empacamos tu pedido con cariño y ya está rumbo a tu casa. Usa el número de guía para seguir su recorrido en tiempo real.
    </p>

    <div class="tracking-card">
      <div class="tracking-label">Número de guía</div>
      <div class="tracking-number">${escapeHtml(trackingNumber || '')}</div>
      <div class="tracking-company">${escapeHtml(carrier || 'Interrapidísimo')}</div>
    </div>

    ${trackingUrl ? `<a href="${trackingUrl}" class="cta-btn">Rastrear pedido</a>` : ''}

    <div class="section-title">Detalles del envío</div>
    ${itemsHtml}

    <div class="info-box">
      <div class="info-box-title">Llegada estimada</div>
      <div class="info-box-text">
        <strong>3 a 8 días hábiles</strong><br/>
        Te avisaremos cuando llegue a destino
      </div>
    </div>

    <a href="${WHATSAPP_URL}" class="cta-secondary">¿Necesitas ayuda?</a>
  </div>

  <div class="footer">
    <div class="footer-help">
      ¿Necesitas ayuda?<br/>
      Escríbenos al WhatsApp <a href="${WHATSAPP_URL}">+57 317 234 6822</a>
    </div>
    <div class="footer-logo">SPLENDORA</div>
    <div class="footer-mini">COL · Manizales, Colombia</div>
  </div>
</div>
</body>
</html>`;
}

// Escape HTML para evitar inyección desde nombres/datos del cliente
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
