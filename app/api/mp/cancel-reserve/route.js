import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/mp/cancel-reserve
// Cancela una reserva pending (libera stock). Se llama cuando el cliente
// cierra el form de checkout sin completar el pago.
export async function POST(request) {
  try {
    const body = await request.json();
    const { reservationId } = body;

    if (!reservationId) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    // Solo cancelamos si está en estado pending (no tocar pagadas)
    const { error } = await supabaseAdmin
      .from('stock_reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error cancelando reserva:', error);
      return NextResponse.json({ error: 'No se pudo cancelar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error cancel-reserve:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
