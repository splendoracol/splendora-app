// ═══════════════════════════════════════════════════════════════
// POST /api/mp/create-preference
// Crea la preferencia de pago en Mercado Pago.
// Soporta 2 modos:
//   1) reservationId (string): 1 producto - modo original
//   2) reservationIds (array): N productos del carrito - modo multi
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      reservationId,        // modo singular
      reservationIds,       // modo multi (array)
      customerName,
      customerPhone,
      customerEmail,
      customerDoc,
      customerAddress,
      customerCity,
      customerNotes,
      marketingOptin,
    } = body;

    // ── 1. Validación básica de datos del cliente ──
    if (!customerName || !customerPhone) {
      return NextResponse.json({ error: 'Nombre y celular requeridos' }, { status: 400 });
    }
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }

    // ── 2. Determinar modo: singular o multi ──
    const isMulti = Array.isArray(reservationIds) && reservationIds.length > 0;
    const ids = isMulti ? reservationIds : (reservationId ? [reservationId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Reserva no válida' }, { status: 400 });
    }
    if (ids.length > 20) {
      return NextResponse.json({ error: 'Máximo 20 productos por compra' }, { status: 400 });
    }

    // ── 3. Traer TODAS las reservas y validar ──
    const { data: reservations, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .in('id', ids);

    if (resError || !reservations || reservations.length !== ids.length) {
      return NextResponse.json({ error: 'Una o más reservas no encontradas' }, { status: 404 });
    }

    // Verificar que todas estén pending y no expiradas
    const now = new Date();
    for (const r of reservations) {
      if (r.status !== 'pending') {
        return NextResponse.json({ error: 'Una reserva ya no es válida. Vuelve a empezar.' }, { status: 410 });
      }
      if (new Date(r.expires_at) < now) {
        // Marcar todas las del lote como expiradas
        await supabaseAdmin
          .from('stock_reservations')
          .update({ status: 'expired' })
          .in('id', ids);
        return NextResponse.json({ error: 'La reserva expiró. Vuelve a empezar.' }, { status: 410 });
      }
    }

    // ── 4. Traer datos de los productos para nombres ──
    const productIds = [...new Set(reservations.map(r => r.product_id))];
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, code')
      .in('id', productIds);

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'Productos no encontrados' }, { status: 404 });
    }
    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });

    // ── 5. Actualizar TODAS las reservas con datos del cliente ──
    await supabaseAdmin
      .from('stock_reservations')
      .update({
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail.toLowerCase(),
        customer_doc: customerDoc || null,
        customer_address: customerAddress || null,
        customer_city: customerCity || null,
        customer_notes: customerNotes || null,
        marketing_optin: marketingOptin !== false,
      })
      .in('id', ids);

    // ── 6. Construir items de MP a partir de las reservas ──
    const mpItems = reservations.map(r => {
      const prod = productMap[r.product_id];
      const productName = prod?.name || 'Producto';
      return {
        id: r.product_id,
        title: `${productName}${r.size ? ` - Talla ${r.size}` : ''}${r.color ? ` - ${r.color}` : ''}`,
        quantity: r.qty,
        unit_price: r.price_unit,
        currency_id: 'COP',
      };
    });

    // ── 7. Crear preferencia MP ──
    // external_reference: para multi usamos "multi:id1,id2,id3" (el webhook lo detecta)
    const externalRef = isMulti ? `multi:${ids.join(',')}` : ids[0];
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://splendoracol.site';
    const preference = new Preference(mpClient);

    let prefData;
    try {
      prefData = await preference.create({
        body: {
          items: mpItems,
          payer: {
            name: customerName,
            email: customerEmail,
            phone: { number: customerPhone },
          },
          back_urls: {
            success: `${baseUrl}/pago/exito?r=${ids[0]}`,
            pending: `${baseUrl}/pago/pendiente?r=${ids[0]}`,
            failure: `${baseUrl}/pago/error?r=${ids[0]}`,
          },
          auto_return: 'approved',
          external_reference: externalRef,
          notification_url: `${baseUrl}/api/mp/webhook`,
          statement_descriptor: 'SPLENDORA',
        },
      });
    } catch (mpErr) {
      console.error('Error MP:', mpErr);
      return NextResponse.json({ error: 'Error generando el pago' }, { status: 500 });
    }

    // ── 8. Guardar preference_id en TODAS las reservas ──
    await supabaseAdmin
      .from('stock_reservations')
      .update({ mp_preference_id: prefData.id })
      .in('id', ids);

    // Total para el frontend
    const totalAmount = reservations.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const expiresAt = reservations[0]?.expires_at;

    return NextResponse.json({
      success: true,
      reservationId: ids[0], // compat con código viejo
      reservationIds: ids,
      preferenceId: prefData.id,
      initPoint: prefData.init_point,
      expiresAt,
      totalAmount,
    });

  } catch (err) {
    console.error('Error en create-preference:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
