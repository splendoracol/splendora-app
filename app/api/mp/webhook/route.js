import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

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
    console.log('[MP Webhook] Notificación recibida:', JSON.stringify(body));

    // MP envía notificaciones con estructura: { type: 'payment', data: { id: '...' } }
    // También puede venir como: { topic: 'payment', resource: '...' }
    let paymentId = null;
    if (body.type === 'payment' && body.data?.id) {
      paymentId = body.data.id;
    } else if (body.topic === 'payment' && body.resource) {
      // Extraer ID de la URL del resource
      const match = String(body.resource).match(/\/(\d+)$/);
      if (match) paymentId = match[1];
    }

    if (!paymentId) {
      console.log('[MP Webhook] No es notificación de pago, ignorada');
      return NextResponse.json({ received: true });
    }

    // ── 1. Consultar el pago en MP para verificar ──
    const payment = new Payment(mpClient);
    let paymentData;
    try {
      paymentData = await payment.get({ id: paymentId });
    } catch (mpErr) {
      console.error('[MP Webhook] Error consultando pago en MP:', mpErr);
      return NextResponse.json({ error: 'No se pudo consultar el pago' }, { status: 500 });
    }

    const status = paymentData.status; // 'approved', 'pending', 'rejected', etc
    const externalReference = paymentData.external_reference; // ID de la reserva
    const amountPaid = Number(paymentData.transaction_amount) || 0;

    console.log(`[MP Webhook] Pago ${paymentId} status=${status} ref=${externalReference}`);

    if (!externalReference) {
      console.log('[MP Webhook] Pago sin external_reference, ignorado');
      return NextResponse.json({ received: true });
    }

    // ── 2. Buscar la reserva ──
    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .eq('id', externalReference)
      .single();

    if (resError || !reservation) {
      console.error('[MP Webhook] Reserva no encontrada:', externalReference);
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    // Idempotencia: si ya está confirmada, no hacer nada
    if (reservation.status === 'paid' && reservation.order_id) {
      console.log('[MP Webhook] Reserva ya confirmada, ignorada');
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    // ── 3. Manejar según el status ──
    if (status === 'approved') {
      // Pago aprobado: crear el pedido y descontar stock
      await confirmReservationAndCreateOrder(reservation, paymentId, amountPaid);
    } else if (status === 'pending' || status === 'in_process' || status === 'authorized') {
      // Pago pendiente: mantener la reserva activa pero marcarla
      await supabaseAdmin
        .from('stock_reservations')
        .update({ mp_payment_id: String(paymentId) })
        .eq('id', reservation.id);
    } else if (status === 'rejected' || status === 'cancelled' || status === 'refunded' || status === 'charged_back') {
      // Pago fallido: liberar la reserva
      await supabaseAdmin
        .from('stock_reservations')
        .update({ status: 'cancelled', mp_payment_id: String(paymentId) })
        .eq('id', reservation.id);
    }

    return NextResponse.json({ received: true, status });

  } catch (err) {
    console.error('[MP Webhook] Error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

// ── Función auxiliar: confirmar reserva y crear pedido ──
async function confirmReservationAndCreateOrder(reservation, paymentId, amountPaid) {
  // 1. Obtener producto para tener cost_total
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', reservation.product_id)
    .single();

  if (!product) {
    console.error('[MP Webhook] Producto no encontrado al confirmar reserva');
    return;
  }

  // 2. Construir el pedido con el mismo formato que usa el admin
  const orderTotal = Number(reservation.total) || 0;
  const costTotal = (Number(product.cost_total) || 0) * (reservation.qty || 1);

  // Generar número de orden (siguiente del counter)
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
    status: 'pending', // estado de despacho, no de pago
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) {
    console.error('[MP Webhook] Error creando pedido:', orderError);
    return;
  }

  // 4. Actualizar el counter
  await supabaseAdmin
    .from('counters')
    .update({ value: nextOrderNumber })
    .eq('id', 'order_number');

  // 5. Descontar stock real del producto
  const newStock = Math.max(0, (Number(product.stock) || 0) - (reservation.qty || 1));
  await supabaseAdmin
    .from('products')
    .update({ stock: newStock })
    .eq('id', product.id);

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

  console.log(`[MP Webhook] Pedido #${nextOrderNumber} creado por MP — reserva ${reservation.id}`);
}
