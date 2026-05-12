import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

// Cliente de Supabase con permisos elevados (service_role) — solo servidor
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Configuración de Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      productId,
      size,
      color,
      qty,
      customerName,
      customerPhone,
      customerEmail,
      customerDoc,
      customerAddress,
      customerCity,
      customerNotes,
    } = body;

    // ── 1. Validación básica ──
    if (!productId || !qty || qty < 1) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    if (!customerName || !customerPhone) {
      return NextResponse.json({ error: 'Nombre y celular requeridos' }, { status: 400 });
    }
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }

    // ── 2. Obtener producto (necesitamos precio y nombre para MP) ──
    const { data: product, error: prodError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
    if (product.archived) {
      return NextResponse.json({ error: 'Este producto ya no está disponible' }, { status: 410 });
    }

    // ── 3. Calcular precio (con descuento si aplica) ──
    const basePrice = Number(product.price) || 0;
    const discount = Number(product.discount) || 0;
    const priceUnit = discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
    const total = priceUnit * qty;

    // ── 4. RESERVA ATÓMICA con función SQL (previene race conditions) ──
    // La función try_reserve_stock hace un LOCK de la fila del producto,
    // verifica stock disponible (descontando reservas activas) e inserta
    // la reserva en una sola transacción atómica. Si dos personas intentan
    // comprar la última unidad al mismo tiempo, solo una pasa.
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: reserveResult, error: rpcError } = await supabaseAdmin.rpc('try_reserve_stock', {
      p_product_id: productId,
      p_size: size || null,
      p_color: color || null,
      p_qty: qty,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_email: customerEmail,
      p_customer_doc: customerDoc || null,
      p_customer_address: customerAddress || null,
      p_customer_city: customerCity || null,
      p_customer_notes: customerNotes || null,
      p_price_unit: priceUnit,
      p_total: total,
      p_expires_at: expiresAt,
    });

    if (rpcError) {
      console.error('Error en try_reserve_stock:', rpcError);
      return NextResponse.json({ error: 'No se pudo procesar la reserva' }, { status: 500 });
    }

    const result = Array.isArray(reserveResult) ? reserveResult[0] : reserveResult;
    if (!result || !result.ok) {
      return NextResponse.json({
        error: result?.error_msg || 'Sin stock disponible',
        available: result?.available ?? 0,
      }, { status: 409 });
    }

    const reservationId = result.reservation_id;

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
              title: `${product.name}${size ? ` - Talla ${size}` : ''}${color ? ` - ${color}` : ''}`,
              quantity: qty,
              unit_price: priceUnit,
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
      // Si falla MP, cancelar la reserva para liberar el stock
      console.error('Error creando preferencia MP:', mpErr);
      await supabaseAdmin
        .from('stock_reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservationId);
      return NextResponse.json({ error: 'Error generando el pago' }, { status: 500 });
    }

    // ── 6. Guardar preference_id en la reserva ──
    await supabaseAdmin
      .from('stock_reservations')
      .update({ mp_preference_id: prefData.id })
      .eq('id', reservationId);

    // ── 7. Devolver al cliente el link de pago ──
    return NextResponse.json({
      success: true,
      reservationId: reservationId,
      preferenceId: prefData.id,
      initPoint: prefData.init_point,
      expiresAt: expiresAt,
    });

  } catch (err) {
    console.error('Error en create-preference:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
