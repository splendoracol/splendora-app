import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET /api/stock/reservations
// Devuelve todas las reservas activas (pending y no expiradas) agrupadas
// por producto+variante, para que el catálogo muestre stock real.
export async function GET() {
  try {
    // Limpiar las que ya expiraron
    await supabaseAdmin
      .from('stock_reservations')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    // Traer las activas
    const { data, error } = await supabaseAdmin
      .from('stock_reservations')
      .select('product_id, size, color, qty, expires_at')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Error consultando reservas:', error);
      return NextResponse.json({ reservations: [] });
    }

    // Devolver con cabeceras anti-cache
    return NextResponse.json(
      { reservations: data || [] },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err) {
    console.error('Error en reservations:', err);
    return NextResponse.json({ reservations: [] });
  }
}
