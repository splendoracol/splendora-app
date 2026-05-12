import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/mp/reserve
// Crea una reserva temporal SIN datos del cliente.
// Devuelve reservationId + expiresAt para que el frontend muestre el timer real.
export async function POST(request) {
  try {
    const body = await request.json();
    const { productId, size, color, qty } = body;

    if (!productId || !qty || qty < 1) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Traer el producto para calcular precio
    const { data: product, error: prodError } = await supabaseAdmin
      .from('products')
      .select('id, price, discount, archived')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
    if (product.archived) {
      return NextResponse.json({ error: 'Producto no disponible' }, { status: 410 });
    }

    const basePrice = Number(product.price) || 0;
    const discount = Number(product.discount) || 0;
    const priceUnit = discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
    const total = priceUnit * qty;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Reserva atómica
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('try_reserve_stock_minimal', {
      p_product_id: productId,
      p_size: size || null,
      p_color: color || null,
      p_qty: qty,
      p_price_unit: priceUnit,
      p_total: total,
      p_expires_at: expiresAt,
    });

    if (rpcError) {
      console.error('Error try_reserve_stock_minimal:', rpcError);
      return NextResponse.json({ error: 'No se pudo crear la reserva' }, { status: 500 });
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!result || !result.ok) {
      return NextResponse.json({
        error: result?.error_msg || 'Sin stock disponible',
        available: result?.available ?? 0,
      }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      reservationId: result.reservation_id,
      expiresAt: expiresAt,
      priceUnit: priceUnit,
      total: total,
    });
  } catch (err) {
    console.error('Error en /api/mp/reserve:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
