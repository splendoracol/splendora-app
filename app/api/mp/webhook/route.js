// ═══════════════════════════════════════════════════════════════
// POST /api/mp/webhook
// Recibe notificaciones de Mercado Pago.
// Soporta:
//   - external_reference = "<uuid>"        → 1 producto (modo singular)
//   - external_reference = "multi:id1,id2" → varios productos (carrito)
// ═══════════════════════════════════════════════════════════════

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

    // ─── DETECTAR MODO: multi vs single ───
    const isMulti = externalReference.startsWith('multi:');
    const reservationIds = isMulti
      ? externalReference.substring(6).split(',').filter(Boolean)
      : [externalReference];

    // Traer las reservas
    const { data: reservations, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('*')
      .in('id', reservationIds);

    if (resError || !reservations || reservations.length === 0) {
      console.error('[MP Webhook] Reservas no encontradas:', reservationIds);
      return NextResponse.json({ error: 'Reservas no encontradas' }, { status: 404 });
    }

    // Idempotencia: si TODAS están paid y con order_id, ya se procesó
    const allPaid = reservations.every(r => r.status === 'paid' && r.order_id);
    if (allPaid) {
      console.log('[MP Webhook] Reservas ya confirmadas, ignoradas');
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    if (status === 'approved') {
      // Verificar si alguna expiró o se canceló
      const now = new Date();
      const hasInvalid = reservations.some(r =>
        r.status === 'cancelled' || r.status === 'expired' || new Date(r.expires_at) < now
      );

      if (hasInvalid) {
        console.log(`[MP Webhook] Una o más reservas invalidas. Verificando stock real...`);
        const allStockOk = await checkAllStocksAvailable(reservations);

        if (allStockOk) {
          console.log('[MP Webhook] Stock disponible, procesando pago');
          if (isMulti) {
            await confirmMultiAndCreateOrder(reservations, paymentId, amountPaid);
          } else {
            await confirmReservationAndCreateOrder(reservations[0], paymentId, amountPaid);
          }
        } else {
          console.log(`[MP Webhook] Sin stock. Iniciando reembolso de ${amountPaid}`);
          if (isMulti) {
            await processRefundMulti(reservations, paymentId, amountPaid, 'reserva_expirada_sin_stock');
          } else {
            await processRefundAndRecord(reservations[0], paymentId, amountPaid, 'reserva_expirada_sin_stock');
          }
        }
      } else {
        if (isMulti) {
          await confirmMultiAndCreateOrder(reservations, paymentId, amountPaid);
        } else {
          await confirmReservationAndCreateOrder(reservations[0], paymentId, amountPaid);
        }
      }
    } else if (status === 'pending' || status === 'in_process' || status === 'authorized') {
      await supabaseAdmin
        .from('stock_reservations')
        .update({ mp_payment_id: String(paymentId) })
        .in('id', reservationIds);
    } else if (status === 'rejected' || status === 'cancelled' || status === 'refunded' || status === 'charged_back') {
      await supabaseAdmin
        .from('stock_reservations')
        .update({ status: 'cancelled', mp_payment_id: String(paymentId) })
        .in('id', reservationIds);
    }

    return NextResponse.json({ received: true, status });

  } catch (err) {
    console.error('[MP Webhook] Error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

// ─── Verifica que TODAS las reservas tengan stock ───
async function checkAllStocksAvailable(reservations) {
  for (const r of reservations) {
    const ok = await checkStockStillAvailable(r);
    if (!ok) return false;
  }
  return true;
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

// ═══════════════════════════════════════════════════════════════
// MULTI: confirmar varias reservas y crear UN pedido con varios items
// ═══════════════════════════════════════════════════════════════
async function confirmMultiAndCreateOrder(reservations, paymentId, amountPaid) {
  const productIds = [...new Set(reservations.map(r => r.product_id))];
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('*')
    .in('id', productIds);

  if (!products || products.length === 0) {
    console.error('[MP Webhook] Productos no encontrados al confirmar multi-reserva');
    return;
  }
  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  // Datos del cliente vienen de la primera reserva (todas tienen los mismos)
  const cust = reservations[0];

  // Construir items[] del pedido
  const orderItems = reservations.map(r => {
    const prod = productMap[r.product_id];
    return {
      productId: r.product_id,
      name: prod?.name || 'Producto',
      code: prod?.code || '',
      qty: r.qty,
      size: r.size,
      color: r.color,
      priceUnit: Number(r.price_unit) || 0,
      costUnit: Number(prod?.cost_total) || 0,
      subtotal: Number(r.total) || 0,
      photoUrl: prod?.photo_url || null,
    };
  });

  const orderTotal = orderItems.reduce((s, it) => s + (it.subtotal || 0), 0);
  const costTotal = orderItems.reduce((s, it) => s + ((it.costUnit || 0) * (it.qty || 1)), 0);

  // Numero de pedido
  const { data: counter } = await supabaseAdmin
    .from('counters')
    .select('value')
    .eq('id', 'order_number')
    .single();
  const currentValue = counter?.value || 0;
  const nextOrderNumber = currentValue < 1000 ? 1001 : currentValue + 1;

  const orderPayload = {
    order_number: nextOrderNumber,
    customer_name: cust.customer_name,
    customer_phone: cust.customer_phone,
    customer_email: cust.customer_email || null,
    customer_doc: cust.customer_doc,
    customer_address: cust.customer_address,
    city: cust.customer_city,
    customer_notes: cust.customer_notes,
    channel: 'Mercado Pago',
    items: orderItems,
    total: orderTotal,
    cost_total: costTotal,
    shipping_charge: 0,
    payment_status: 'paid',
    amount_paid: amountPaid > 0 ? amountPaid : orderTotal,
    payment_notes: `Pago automático MP — payment_id: ${paymentId} (${reservations.length} productos)`,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) {
    console.error('[MP Webhook] Error creando pedido multi:', orderError);
    return;
  }

  await supabaseAdmin
    .from('counters')
    .upsert({ id: 'order_number', value: nextOrderNumber });

  // Descontar stock de cada producto
  for (const r of reservations) {
    const prod = productMap[r.product_id];
    if (!prod) continue;

    const hasVar = !!(prod.variants && Array.isArray(prod.variants.items) && prod.variants.items.length > 0);
    const qty = r.qty || 1;

    if (hasVar) {
      const mode = prod.variants.mode;
      const newItems = prod.variants.items.map(it => {
        const sizeMatch = mode === 'color_only' || (it.size === r.size);
        const colorMatch = mode === 'size_only' || (it.color === r.color);
        if (sizeMatch && colorMatch) {
          return { ...it, stock: Math.max(0, (Number(it.stock) || 0) - qty) };
        }
        return it;
      });
      const newTotalStock = newItems.reduce((s, it) => s + (Number(it.stock) || 0), 0);
      await supabaseAdmin
        .from('products')
        .update({ variants: { ...prod.variants, items: newItems }, stock: newTotalStock })
        .eq('id', prod.id);
      // Actualizar mapa local para próximas iteraciones del mismo producto
      productMap[prod.id] = { ...prod, variants: { ...prod.variants, items: newItems }, stock: newTotalStock };
    } else {
      const newStock = Math.max(0, (Number(prod.stock) || 0) - qty);
      await supabaseAdmin
        .from('products')
        .update({ stock: newStock })
        .eq('id', prod.id);
      productMap[prod.id] = { ...prod, stock: newStock };
    }
  }

  // Marcar TODAS las reservas como paid
  await supabaseAdmin
    .from('stock_reservations')
    .update({
      status: 'paid',
      mp_payment_id: String(paymentId),
      confirmed_at: new Date().toISOString(),
      order_id: newOrder.id,
    })
    .in('id', reservations.map(r => r.id));

  // Email marketing
  try {
    await supabaseAdmin.rpc('upsert_email_customer', {
      p_email: cust.customer_email,
      p_name: cust.customer_name,
      p_phone: cust.customer_phone,
      p_city: cust.customer_city,
      p_marketing_optin: cust.marketing_optin !== false,
      p_order_total: orderTotal,
    });
  } catch (err) {
    console.error('[MP Webhook] Error en upsert email_list:', err);
  }

  // Email de confirmación
  try {
    await sendConfirmationEmail({
      orderNumber: nextOrderNumber,
      customerName: cust.customer_name,
      customerEmail: cust.customer_email,
      items: orderItems,
      total: orderTotal,
      address: cust.customer_address,
      city: cust.customer_city,
      phone: cust.customer_phone,
    });
  } catch (err) {
    console.error('[MP Webhook] Error enviando email confirmación:', err);
  }

  console.log(`[MP Webhook] Pedido MULTI #${nextOrderNumber} creado: ${reservations.length} productos`);
}

// ═══════════════════════════════════════════════════════════════
// MULTI: refund completo + crear pedido marcado como reembolsado
// ═══════════════════════════════════════════════════════════════
async function processRefundMulti(reservations, paymentId, amountPaid, reason) {
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
    console.log(`[MP Webhook] Reembolso MULTI OK: refund_id=${refundId}`);
  } catch (err) {
    refundError = err?.message || 'Error desconocido en reembolso';
    console.error('[MP Webhook] Error en reembolso multi:', err);
  }

  const productIds = [...new Set(reservations.map(r => r.product_id))];
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('*')
    .in('id', productIds);
  const productMap = {};
  (products || []).forEach(p => { productMap[p.id] = p; });

  const cust = reservations[0];

  const orderItems = reservations.map(r => {
    const prod = productMap[r.product_id];
    return {
      productId: r.product_id,
      name: prod?.name || 'Producto',
      code: prod?.code || '',
      qty: r.qty,
      size: r.size,
      color: r.color,
      priceUnit: Number(r.price_unit) || 0,
      costUnit: Number(prod?.cost_total) || 0,
      subtotal: Number(r.total) || 0,
      photoUrl: prod?.photo_url || null,
    };
  });

  const orderTotal = orderItems.reduce((s, it) => s + (it.subtotal || 0), 0);

  const { data: counter } = await supabaseAdmin
    .from('counters')
    .select('value')
    .eq('id', 'order_number')
    .single();
  const currentValue = counter?.value || 0;
  const nextOrderNumber = currentValue < 1000 ? 1001 : currentValue + 1;

  const reasonText = reason === 'reserva_expirada_sin_stock'
    ? 'Cliente pagó después de los 10 minutos y al menos un producto ya fue vendido'
    : reason;
  const refundStatusText = refundOk
    ? `✅ Reembolso automático procesado en Mercado Pago (refund_id: ${refundId})`
    : `🔴 REEMBOLSO FALLIDO — DEBES REEMBOLSAR MANUALMENTE EN MP: ${refundError}`;

  const orderPayload = {
    order_number: nextOrderNumber,
    customer_name: cust.customer_name,
    customer_phone: cust.customer_phone,
    customer_email: cust.customer_email || null,
    customer_doc: cust.customer_doc,
    customer_address: cust.customer_address,
    city: cust.customer_city,
    customer_notes: `[REEMBOLSADO MULTI] ${reasonText}\n${refundStatusText}\n${cust.customer_notes || ''}`.trim(),
    channel: 'Mercado Pago',
    items: orderItems,
    total: orderTotal,
    cost_total: 0,
    shipping_charge: 0,
    payment_status: 'refunded',
    amount_paid: amountPaid,
    payment_notes: `${refundStatusText} — payment_id: ${paymentId}`,
    status: 'cancelled',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) {
    console.error('[MP Webhook] Error creando pedido multi reembolsado:', orderError);
    return;
  }

  await supabaseAdmin
    .from('counters')
    .upsert({ id: 'order_number', value: nextOrderNumber });

  // Marcar reservas como cancelled (no se entregaron)
  await supabaseAdmin
    .from('stock_reservations')
    .update({
      status: 'cancelled',
      mp_payment_id: String(paymentId),
      order_id: newOrder.id,
    })
    .in('id', reservations.map(r => r.id));

  console.log(`[MP Webhook] Pedido MULTI #${nextOrderNumber} registrado como REEMBOLSADO`);
}

// ═══════════════════════════════════════════════════════════════
// SINGULAR (legacy, sin cambios)
// ═══════════════════════════════════════════════════════════════
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
    customer_name: reservation.customer_name,
    customer_phone: reservation.customer_phone,
    customer_email: reservation.customer_email || null,
    customer_doc: reservation.customer_doc,
    customer_address: reservation.customer_address,
    city: reservation.customer_city,
    customer_notes: `[REEMBOLSADO] ${reasonText}\n${refundStatusText}\n${reservation.customer_notes || ''}`.trim(),
    channel: 'Mercado Pago',
    items: [{
      productId: reservation.product_id,
      name: product.name,
      code: product.code,
      qty: reservation.qty,
      size: reservation.size,
      color: reservation.color,
      priceUnit: Number(reservation.price_unit) || 0,
      costUnit: 0,
      subtotal: orderTotal,
      photoUrl: product.photo_url || null,
    }],
    total: orderTotal,
    cost_total: 0,
    shipping_charge: 0,
    payment_status: 'refunded',
    amount_paid: amountPaid,
    payment_notes: `${refundStatusText} — payment_id: ${paymentId}`,
    status: 'cancelled',
    created_at: new Date().toISOString(),
  };

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (orderError) {
    console.error('[MP Webhook] Error creando pedido reembolsado:', orderError);
    return;
  }

  await supabaseAdmin
    .from('counters')
    .upsert({ id: 'order_number', value: nextOrderNumber });

  await supabaseAdmin
    .from('stock_reservations')
    .update({
      status: 'cancelled',
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
      photoUrl: product.photo_url || null,
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
