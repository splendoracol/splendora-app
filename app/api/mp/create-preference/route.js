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
      reservationId, // ← ID de reserva creada en /api/mp/reserve
      customerName,
      customerPhone,
      customerEmail,
      customerDoc,
      customerAddress,
      customerCity,
      customerNotes,
    } = body;

    // ── 1. Validación básica ──
    if (!reservationId) {
      return NextResponse.json({ error: 'Reserva no válida' }, { status: 400 });
    }
    if (!customerName || !customerPhone) {
      return NextResponse.json({ error: 'Nombre y celular requeridos' }, { status: 400 });
    }
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }

    // ── 2. Traer la reserva (debe existir y estar pending no expirada) ──
    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }
    if (reservation.status !== 'pending') {
      return NextResponse.json({ error: 'Esta reserva ya no es válida' }, { status: 410 });
    }
    if (new Date(reservation.expires_at) < new Date()) {
      // Expiró: marcarla y devolver error
      await supabaseAdmin
        .from('stock_reservations')
        .update({ status: 'expired' })
        .eq('id', reservationId);
      return NextResponse.json({ error: 'La reserva expiró. Vuelve a empezar.' }, { status: 410 });
    }

    // ── 3. Traer el producto para usar nombre en MP ──
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, name, code')
      .eq('id', reservation.product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // ── 4. Actualizar reserva con datos del cliente ──
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
      })
      .eq('id', reservationId);

    // ── 5. Crear preferencia en Mercado Pago ──
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://splendoracol.site';
    const preference = new Preference(mpClient);

    let prefData;
    try {
      prefData = await preference.create({
        body: {
          items: [
            {
              id: product.id,
              title: `${product.name}${reservation.size ? ` - Talla ${reservation.size}` : ''}${reservation.color ? ` - ${reservation.color}` : ''}`,
              quantity: reservation.qty,
              unit_price: reservation.price_unit,
              currency_id: 'COP',
            },
          ],
          payer: {
            name: customerName,
            email: customerEmail,
            phone: { number: customerPhone },
          },
          back_urls: {
            success: `${baseUrl}/pago/exito?r=${reservationId}`,
            pending: `${baseUrl}/pago/pendiente?r=${reservationId}`,
            failure: `${baseUrl}/pago/error?r=${reservationId}`,
          },
          auto_return: 'approved',
          external_reference: reservationId,
          notification_url: `${baseUrl}/api/mp/webhook`,
          statement_descriptor: 'SPLENDORA',
        },
      });
    } catch (mpErr) {
      console.error('Error MP:', mpErr);
      return NextResponse.json({ error: 'Error generando el pago' }, { status: 500 });
    }

    // ── 6. Guardar preference_id en la reserva ──
    await supabaseAdmin
      .from('stock_reservations')
      .update({ mp_preference_id: prefData.id })
      .eq('id', reservationId);

    return NextResponse.json({
      success: true,
      reservationId: reservationId,
      preferenceId: prefData.id,
      initPoint: prefData.init_point,
      expiresAt: reservation.expires_at,
    });

  } catch (err) {
    console.error('Error en create-preference:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
