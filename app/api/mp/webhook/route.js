import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';
import { sendConfirmationEmail } from '../../../../lib/emails';

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
    console.log('[MP Webhook] Notificación recibida:', JSON.stringify(body));

    let paymentId = null;
    if (body.type === 'payment' && body.data?.id) {
      paymentId = body.data.id;
    } else if (body.topic === 'payment' && body.resource) {
      const match = String(body.resource).match(/\/(\d+)$/);
      if (match) paymentId = match[1];
    }

    if (!paymentId) {
      console.log('[MP Webhook] No es notificación de pago, ignorada');
      return NextResponse.json({ received: true });
    }

    const payment = new Payment(mpClient);
    let paymentData;
    try {
      paymentData = await payment.get({ id: paymentId });
    } catch (mpErr) {
      console.error('[MP Webhook] Error consultando pago en MP:', mpErr);
      return NextResponse.json({ error: 'No se pudo consultar el pago' }, { status: 500 });
    }

    const status = paymentData.status;
    const externalReference = paymentData.external_reference;
    const amountPaid = Number(paymentData.transaction_amount) || 0;

    console.log(`[MP Webhook] Pago ${paymentId} status=${status} ref=${externalReference}`);

    if (!externalReference) {
      console.log('[MP Webhook] Pago sin external_reference, ignorado');
      return NextResponse.json({ received: true });
    }

    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .eq('id', externalReference)
      .single();

    if (resError || !reservation) {
      console.error('[MP Webhook] Reserva no encontrada:', externalReference);
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    if (reservation.status === 'paid' && reservation.order_id) {
      console.log('[MP Webhook] Reserva ya confirmada, ignorada');
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    if (status === 'approved') {
      const expiredReserve = new Date(reservation.expires_at) < new Date();
      const cancelledReserve = reservation.status === 'cancelled' || reservation.status === 'expired';

      if (expiredReserve || cancelledReserve) {
        console.log(`[MP Webhook] Reserva ${reservation.id} expirada/cancelada. Verificando stock real...`);
        const stockAvailable = await checkStockStillAvailable(reservation);

        if (stockAvailable) {
          console.log('[MP Webhook] Stock disponible, procesando pago');
          await confirmReservationAndCreateOrder(reservation, paymentId, amountPaid);
        } else {
          console.log(`[MP Webhook] Sin stock. Iniciando reembolso de ${amountPaid}`);
          await processRefundAndRecord(reservation, paymentId, amountPaid, 'reserva_expirada_sin_stock');
        }
      } else {
        await confirmReservationAndCreateOrder(reservation, paymentId, amountPaid);
      }
    } else if (status === 'pending' || status === 'in_process' || status === 'authorized') {
      await supabaseAdmin
        .from('stock_reservations')
        .update({ mp_payment_id: String(paymentId) })
        .eq('id', reservation.id);
    } else if (status === 'rejected' || status === 'cancelled' || status === 'refunded' || status === 'charged_back') {
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

async function processRefundAndRecord(reservation, paymentId, amountPaid, reason) {
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
    console.log(`[MP Webhook] Reembolso OK: refund_id=${refundId}`);
  } catch (err) {
    refundError = err?.message || 'Error desconocido en reembolso';
    console.error('[MP Webhook] Error en reembolso:', err);
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', reservation.product_id)
    .single();

  if (!product) {
    console.error('[MP Webhook] Producto no encontrado al registrar reembolso');
    return;
  }

  const { data: counter } = await supabaseAdmin
    .from('counters')
    .select('value')
    .eq('id', 'order_number')
    .single();
  const currentValue = counter?.value || 0;
  const nextOrderNumber = currentValue < 1000 ? 1001 : currentValue + 1;

  const orderTotal = Number(reservation.total) || 0;
  const reasonText = reason === 'reserva_expirada_sin_stock'
    ? 'Cliente pagó después de los 10 minutos y el producto ya fue vendido a otra persona'
    : reason;
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
    payment_notes: `🔴 REEMBOLSO AUTOMÁTICO\n\nMotivo: ${reasonText}\n\n${refundStatusText}\n\nPayment ID: ${paymentId}`,
    status: 'refunded',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) {
    console.error('[MP Webhook] Error creando pedido de reembolso:', orderError);
    return;
  }

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

  console.log(`[MP Webhook] Pedido #${nextOrderNumber} registrado como REEMBOLSADO`);
}

async function confirmReservationAndCreateOrder(reservation, paymentId, amountPaid) {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', reservation.product_id)
    .single();

  if (!product) {
    console.error('[MP Webhook] Producto no encontrado al confirmar reserva');
    return;
  }

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
    console.error('[MP Webhook] Error creando pedido:', orderError);
    return;
  }

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
    console.error('[MP Webhook] Error en upsert email_list:', err);
  }

  // Enviar email de confirmación de compra al cliente (no bloquea si falla)
  try {
    await sendConfirmationEmail({
      orderNumber: nextOrderNumber,
      customerName: reservation.customer_name,
      customerEmail: reservation.customer_email,
      items: orderPayload.items,
      total: orderTotal,
      address: reservation.customer_address,
      city: reservation.customer_city,
      phone: reservation.customer_phone,
    });
  } catch (err) {
    console.error('[MP Webhook] Error enviando email confirmación:', err);
  }

  console.log(`[MP Webhook] Pedido #${nextOrderNumber} creado por MP — reserva ${reservation.id}`);
}
