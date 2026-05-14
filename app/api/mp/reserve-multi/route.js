// ═══════════════════════════════════════════════════════════════
// POST /api/mp/reserve-multi
// Crea reservas atómicas para varios productos del carrito.
// Si alguno falla, deshace TODAS las reservas ya creadas (rollback).
// Devuelve array de {reservationId, expiresAt} + totales.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request) {
  const createdReservationIds = []; // para rollback si algo falla
  try {
    const body = await request.json();
    const { items } = body;

    // Validación inicial
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Carrito vacío' }, { status: 400 });
    }
    if (items.length > 20) {
      return NextResponse.json({ error: 'Máximo 20 productos por compra' }, { status: 400 });
    }

    // Validar estructura de cada item
    for (const it of items) {
      if (!it.productId || !it.qty || it.qty < 1) {
        return NextResponse.json({ error: 'Datos de producto incompletos' }, { status: 400 });
      }
    }

    // Todos los items reservan con el MISMO expiresAt (mismo timer)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const reservations = [];
    let totalAmount = 0;

    // ── Reservar uno por uno (atómico por item, no por batch) ──
    for (const it of items) {
      // 1. Traer producto
      const { data: product, error: prodError } = await supabaseAdmin
        .from('products')
        .select('id, name, price, discount, archived')
        .eq('id', it.productId)
        .single();

      if (prodError || !product) {
        await rollback(createdReservationIds);
        return NextResponse.json({ error: `Producto no encontrado` }, { status: 404 });
      }
      if (product.archived) {
        await rollback(createdReservationIds);
        return NextResponse.json({ error: `Producto "${product.name}" ya no está disponible` }, { status: 410 });
      }

      // 2. Calcular precio
      const basePrice = Number(product.price) || 0;
      const discount = Number(product.discount) || 0;
      const priceUnit = discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
      const total = priceUnit * it.qty;

      // 3. Reservar stock
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('try_reserve_stock_minimal', {
        p_product_id: it.productId,
        p_size: it.size || null,
        p_color: it.color || null,
        p_qty: it.qty,
        p_price_unit: priceUnit,
        p_total: total,
        p_expires_at: expiresAt,
      });

      if (rpcError) {
        console.error('Error try_reserve_stock_minimal:', rpcError);
        await rollback(createdReservationIds);
        return NextResponse.json({ error: 'Error al reservar stock' }, { status: 500 });
      }

      const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!result || !result.ok) {
        await rollback(createdReservationIds);
        return NextResponse.json({
          error: result?.error_msg || `Sin stock de "${product.name}". Quita este producto del carrito.`,
          productName: product.name,
        }, { status: 409 });
      }

      createdReservationIds.push(result.reservation_id);
      reservations.push({
        reservationId: result.reservation_id,
        productId: it.productId,
        productName: product.name,
        size: it.size || null,
        color: it.color || null,
        qty: it.qty,
        priceUnit,
        total,
      });
      totalAmount += total;
    }

    // ── Éxito: devolver todas las reservas ──
    return NextResponse.json({
      success: true,
      reservations,
      totalAmount,
      expiresAt,
    });
  } catch (err) {
    console.error('Error en /api/mp/reserve-multi:', err);
    await rollback(createdReservationIds);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

// ── Rollback: cancelar todas las reservas creadas ──
async function rollback(reservationIds) {
  if (!reservationIds || reservationIds.length === 0) return;
  try {
    await supabaseAdmin
      .from('stock_reservations')
      .update({ status: 'cancelled' })
      .in('id', reservationIds);
  } catch (err) {
    console.error('Error en rollback de reservas:', err);
  }
}
