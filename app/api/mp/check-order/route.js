import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';

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

    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    // Ya confirmada
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

    // Ya reembolsada
    if (reservation.status === 'refunded' && reservation.order_id) {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('order_number')
        .eq('id', reservation.order_id)
        .single();
      return NextResponse.json({
        status: 'refunded',
        orderNumber: order?.order_number || null,
      });
    }

    if (reservation.status === 'cancelled') {
      return NextResponse.json({ status: 'cancelled', orderNumber: null });
    }

    if (paymentId) {
      try {
        const payment = new Payment(mpClient);
        const paymentData = await payment.get({ id: paymentId });
        const status = paymentData.status;
        const amountPaid = Number(paymentData.transaction_amount) || 0;

        if (status === 'approved') {
          // Verificar si la reserva sigue válida + stock disponible
          const expiredReserve = new Date(reservation.expires_at) < new Date();
          const cancelledReserve = reservation.status === 'cancelled' || reservation.status === 'expired';

          if (expiredReserve || cancelledReserve) {
            const stockAvailable = await checkStockStillAvailable(reservation);
            if (!stockAvailable) {
              // Sin stock → reembolsar
              const orderNumber = await processRefundAndRecord(reservation, paymentId, amountPaid);
              return NextResponse.json({ status: 'refunded', orderNumber });
            }
          }

          const orderNumber = await confirmReservationAndCreateOrder(reservation, paymentId, amountPaid);
          return NextResponse.json({ status: 'paid', orderNumber });
        } else if (status === 'pending' || status === 'in_process') {
          return NextResponse.json({ status: 'pending', orderNumber: null });
        } else {
          await supabaseAdmin
            .from('stock_reservations')
            .update({ status: 'cancelled', mp_payment_id: String(paymentId) })
            .eq('id', reservation.id);
          return NextResponse.json({ status: 'cancelled', orderNumber: null });
        }
      } catch (mpErr) {
        console.error('[Check-order] Error consultando MP:', mpErr);
        return NextResponse.json({ status: 'pending', orderNumber: null });
      }
    }

    return NextResponse.json({ status: reservation.status, orderNumber: null });

  } catch (err) {
    console.error('[Check-order] Error general:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

async function checkStockStillAvailable(reservation) {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('stock, variants, archived')
    .eq('id', reservation.product_id)
    .single();

  if (!product || product.archived) return false;
  const productHasVariants = !!(product.variants && Array.isArray(product.variants.items) && product.variants.items.length > 0);
  const wantedQty = reservation.qty || 1;

  if (productHasVariants) {
    const mode = product.variants.mode;
    const variant = product.variants.items.find(it => {
      const sizeMatch = mode === 'color_only' || (it.size === reservation.size);
      const colorMatch = mode === 'size_only' || (it.color === reservation.color);
      return sizeMatch && colorMatch;
    });
    if (!variant) return false;
    return (Number(variant.stock) || 0) >= wantedQty;
  } else {
    return (Number(product.stock) || 0) >= wantedQty;
  }
}

async function processRefundAndRecord(reservation, paymentId, amountPaid) {
  // Re-verificar idempotencia
  const { data: freshReservation } = await supabaseAdmin
    .from('stock_reservations')
    .select('status, order_id')
    .eq('id', reservation.id)
    .single();

  if (freshReservation?.order_id) {
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('order_number')
      .eq('id', freshReservation.order_id)
      .single();
    return existingOrder?.order_number || null;
  }

  let refundOk = false;
  let refundId = null;
  let refundError = null;

  try {
    const refundClient = new PaymentRefund(mpClient);
    const refundResult = await refundClient.create({
      payment_id: paymentId,
      body: { amount: amountPaid },
    });
    refundOk = true;
    refundId = refundResult?.id || null;
  } catch (err) {
    refundError = err?.message || 'Error desconocido';
    console.error('[Check-order] Error en reembolso:', err);
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', reservation.product_id)
    .single();

  if (!product) return null;

  const { data: counter } = await supabaseAdmin
    .from('counters')
    .select('value')
    .eq('id', 'order_number')
    .single();
  const currentValue = counter?.value || 0;
  const nextOrderNumber = currentValue < 1000 ? 1001 : currentValue + 1;

  const orderTotal = Number(reservation.total) || 0;
  const refundStatusText = refundOk
    ? `✅ Reembolso automático procesado en Mercado Pago (refund_id: ${refundId})`
    : `🔴 REEMBOLSO FALLIDO — DEBES REEMBOLSAR MANUALMENTE EN MP: ${refundError}`;

  const orderPayload = {
    order_number: nextOrderNumber,
    customer_name: reservation.customer_name || 'Cliente',
    customer_phone: reservation.customer_phone || '',
    customer_email: reservation.customer_email || null,
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
    cost_total: 0,
    shipping_charge: 0,
    payment_status: 'refunded',
    amount_paid: amountPaid,
    payment_notes: `🔴 REEMBOLSO AUTOMÁTICO\n\nMotivo: Cliente pagó después de los 10 minutos y el producto ya fue vendido a otra persona\n\n${refundStatusText}\n\nPayment ID: ${paymentId}`,
    status: 'refunded',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) return null;

  await supabaseAdmin
    .from('counters')
    .upsert({ id: 'order_number', value: nextOrderNumber });

  await supabaseAdmin
    .from('stock_reservations')
    .update({
      status: 'refunded',
      mp_payment_id: String(paymentId),
      order_id: newOrder.id,
    })
    .eq('id', reservation.id);

  return nextOrderNumber;
}

async function confirmReservationAndCreateOrder(reservation, paymentId, amountPaid) {
  // Re-verificar idempotencia
  const { data: freshReservation } = await supabaseAdmin
    .from('stock_reservations')
    .select('status, order_id')
    .eq('id', reservation.id)
    .single();

  if (freshReservation?.status === 'paid' && freshReservation?.order_id) {
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('order_number')
      .eq('id', freshReservation.order_id)
      .single();
    return existingOrder?.order_number || null;
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', reservation.product_id)
    .single();

  if (!product) return null;

  const orderTotal = Number(reservation.total) || 0;
  const costTotal = (Number(product.cost_total) || 0) * (reservation.qty || 1);

  const { data: counter } = await supabaseAdmin
    .from('counters')
    .select('value')
    .eq('id', 'order_number')
    .single();
  const currentValue = counter?.value || 0;
  const nextOrderNumber = currentValue < 1000 ? 1001 : currentValue + 1;

  const orderPayload = {
    order_number: nextOrderNumber,
    customer_name: reservation.customer_name,
    customer_phone: reservation.customer_phone,
    customer_email: reservation.customer_email || null,
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
    payment_notes: `Pago confirmado vía redirect — payment_id: ${paymentId}`,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) return null;

  await supabaseAdmin
    .from('counters')
    .upsert({ id: 'order_number', value: nextOrderNumber });

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

  await supabaseAdmin
    .from('stock_reservations')
    .update({
      status: 'paid',
      mp_payment_id: String(paymentId),
      confirmed_at: new Date().toISOString(),
      order_id: newOrder.id,
    })
    .eq('id', reservation.id);

  // Registrar/actualizar cliente en email_list (para email marketing)
  try {
    await supabaseAdmin.rpc('upsert_email_customer', {
      p_email: reservation.customer_email,
      p_name: reservation.customer_name,
      p_phone: reservation.customer_phone,
      p_city: reservation.customer_city,
      p_marketing_optin: reservation.marketing_optin !== false,
      p_order_total: orderTotal,
    });
  } catch (err) {
    console.error('[Check-order] Error en upsert email_list:', err);
  }

  return nextOrderNumber;
}
