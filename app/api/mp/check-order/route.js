import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('r');
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');

    if (!reservationId) {
      return NextResponse.json({ error: 'Falta r' }, { status: 400 });
    }

    // 1. Obtener la reserva
    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    // 2. ¿Ya está confirmada? Devolver número de pedido
    if (reservation.status === 'paid' && reservation.order_id) {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('order_number')
        .eq('id', reservation.order_id)
        .single();

      return NextResponse.json({
        status: 'paid',
        orderNumber: order?.order_number || null,
      });
    }

    // 3. ¿Está cancelada o expirada? No hacer nada
    if (reservation.status === 'cancelled' || reservation.status === 'expired') {
      return NextResponse.json({ status: reservation.status, orderNumber: null });
    }

    // 4. Si tenemos paymentId (vino del redirect de MP), verificar directamente con MP
    // Esto es el "respaldo" en caso de que el webhook no haya funcionado
    if (paymentId) {
      try {
        const payment = new Payment(mpClient);
        const paymentData = await payment.get({ id: paymentId });

        const status = paymentData.status;
        const amountPaid = Number(paymentData.transaction_amount) || 0;

        if (status === 'approved') {
          // ¡Confirmar y crear pedido!
          const orderNumber = await confirmReservationAndCreateOrder(reservation, paymentId, amountPaid);
          return NextResponse.json({
            status: 'paid',
            orderNumber,
          });
        } else if (status === 'pending' || status === 'in_process') {
          return NextResponse.json({ status: 'pending', orderNumber: null });
        } else {
          // rejected, cancelled
          await supabaseAdmin
            .from('stock_reservations')
            .update({ status: 'cancelled', mp_payment_id: String(paymentId) })
            .eq('id', reservation.id);
          return NextResponse.json({ status: 'cancelled', orderNumber: null });
        }
      } catch (mpErr) {
        console.error('[Check-order] Error consultando MP:', mpErr);
        // Falla la consulta a MP — devolver pending para reintentar
        return NextResponse.json({ status: 'pending', orderNumber: null });
      }
    }

    // Sin paymentId, solo devolver el estado actual
    return NextResponse.json({ status: reservation.status, orderNumber: null });

  } catch (err) {
    console.error('[Check-order] Error general:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

// ── Función compartida con webhook: crear pedido y descontar stock ──
async function confirmReservationAndCreateOrder(reservation, paymentId, amountPaid) {
  // Re-verificar que la reserva siga pendiente (race condition con webhook)
  const { data: freshReservation } = await supabaseAdmin
    .from('stock_reservations')
    .select('status, order_id')
    .eq('id', reservation.id)
    .single();

  if (freshReservation?.status === 'paid' && freshReservation?.order_id) {
    // Otro proceso ya la confirmó. Devolver el pedido existente.
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('order_number')
      .eq('id', freshReservation.order_id)
      .single();
    return existingOrder?.order_number || null;
  }

  // 1. Obtener producto
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', reservation.product_id)
    .single();

  if (!product) {
    console.error('[Check-order] Producto no encontrado');
    return null;
  }

  const orderTotal = Number(reservation.total) || 0;
  const costTotal = (Number(product.cost_total) || 0) * (reservation.qty || 1);

  // 2. Generar order_number
  const { data: counter } = await supabaseAdmin
    .from('counters')
    .select('value')
    .eq('id', 'order_number')
    .single();

  const nextOrderNumber = (counter?.value || 0) + 1;

  // 3. Crear pedido
  const orderPayload = {
    order_number: nextOrderNumber,
    customer_name: reservation.customer_name,
    customer_phone: reservation.customer_phone,
    customer_doc: reservation.customer_doc,
    customer_address: reservation.customer_address,
    city: reservation.customer_city,
    customer_notes: reservation.customer_notes,
    channel: 'Mercado Pago',
    items: [{
      productId: reservation.product_id,
      name: product.name,
      code: product.code,
      qty: reservation.qty,
      size: reservation.size,
      color: reservation.color,
      priceUnit: Number(reservation.price_unit) || 0,
      costUnit: Number(product.cost_total) || 0,
      subtotal: orderTotal,
    }],
    total: orderTotal,
    cost_total: costTotal,
    shipping_charge: 0,
    payment_status: 'paid',
    amount_paid: amountPaid > 0 ? amountPaid : orderTotal,
    payment_notes: `Pago automático MP — payment_id: ${paymentId}`,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) {
    console.error('[Check-order] Error creando pedido:', orderError);
    return null;
  }

  // 4. Actualizar counter
  await supabaseAdmin
    .from('counters')
    .update({ value: nextOrderNumber })
    .eq('id', 'order_number');

  // 5. Descontar stock de la variante específica (si tiene variantes)
  const productHasVariants = !!(product.variants && Array.isArray(product.variants.items) && product.variants.items.length > 0);
  const reservedQty = reservation.qty || 1;

  if (productHasVariants) {
    const mode = product.variants.mode;
    const newItems = product.variants.items.map(it => {
      const sizeMatch = mode === 'color_only' || (it.size === reservation.size);
      const colorMatch = mode === 'size_only' || (it.color === reservation.color);
      if (sizeMatch && colorMatch) {
        return { ...it, stock: Math.max(0, (Number(it.stock) || 0) - reservedQty) };
      }
      return it;
    });
    const newTotalStock = newItems.reduce((s, it) => s + (Number(it.stock) || 0), 0);
    await supabaseAdmin
      .from('products')
      .update({
        variants: { ...product.variants, items: newItems },
        stock: newTotalStock,
      })
      .eq('id', product.id);
  } else {
    const newStock = Math.max(0, (Number(product.stock) || 0) - reservedQty);
    await supabaseAdmin
      .from('products')
      .update({ stock: newStock })
      .eq('id', product.id);
  }

  // 6. Marcar reserva como confirmada
  await supabaseAdmin
    .from('stock_reservations')
    .update({
      status: 'paid',
      mp_payment_id: String(paymentId),
      confirmed_at: new Date().toISOString(),
      order_id: newOrder.id,
    })
    .eq('id', reservation.id);

  console.log(`[Check-order] Pedido #${nextOrderNumber} creado por respaldo — reserva ${reservation.id}`);
  return nextOrderNumber;
}
