import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendShippedEmail } from '../../../../lib/emails';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/email/send-shipped
// Dispara el email "Tu pedido está en camino" para un pedido.
// Llamado desde el admin cuando se marca un pedido como "Enviado".
export async function POST(request) {
  try {
    const body = await request.json();
    const { orderId, trackingNumber, carrier } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId requerido' }, { status: 400 });
    }

    // Traer datos del pedido
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    if (!order.customer_email) {
      return NextResponse.json({ success: false, reason: 'Pedido sin email' });
    }

    // Guardar el número de guía y empresa en el pedido para referencia futura
    await supabaseAdmin
      .from('orders')
      .update({
        tracking_number: trackingNumber || null,
        tracking_carrier: carrier || 'Interrapidísimo',
      })
      .eq('id', orderId);

    // Enviar el email (no lanza excepciones)
    const result = await sendShippedEmail({
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      items: order.items || [],
      trackingNumber: trackingNumber,
      carrier: carrier || 'Interrapidísimo',
    });

    return NextResponse.json({
      success: result.success,
      id: result.id,
      error: result.error,
    });
  } catch (err) {
    console.error('[send-shipped] Error:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
