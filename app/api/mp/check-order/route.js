import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('r');

    if (!reservationId) {
      return NextResponse.json({ error: 'Falta r' }, { status: 400 });
    }

    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .select('id, status, order_id')
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    if (reservation.status !== 'paid' || !reservation.order_id) {
      // Aún no se ha procesado
      return NextResponse.json({ status: reservation.status, orderNumber: null });
    }

    // Obtener el número de pedido
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_number')
      .eq('id', reservation.order_id)
      .single();

    return NextResponse.json({
      status: 'paid',
      orderNumber: order?.order_number || null,
    });

  } catch (err) {
    console.error('Error en check-order:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
