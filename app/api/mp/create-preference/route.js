import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

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
    const {
      productId,
      size,
      color,
      qty,
      customerName,
      customerPhone,
      customerDoc,
      customerAddress,
      customerCity,
      customerNotes,
    } = body;

    // ── 1. Validación básica ──
    if (!productId || !qty || qty < 1) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    if (!customerName || !customerPhone) {
      return NextResponse.json({ error: 'Nombre y celular requeridos' }, { status: 400 });
    }

    // ── 2. Obtener producto ──
    const { data: product, error: prodError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
    if (product.archived) {
      return NextResponse.json({ error: 'Este producto ya no está disponible' }, { status: 410 });
    }

    // ── 3. Limpiar reservas expiradas antes de calcular stock disponible ──
    await supabaseAdmin
      .from('stock_reservations')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    // ── 4. Calcular stock disponible real ──
    // Si el producto tiene variantes, stock = stock de esa variante específica - reservas de esa variante
    // Si no tiene variantes, stock = product.stock - reservas del producto

    const productHasVariants = !!(product.variants && Array.isArray(product.variants.items) && product.variants.items.length > 0);
    let baseStock = 0;

    if (productHasVariants) {
      const mode = product.variants.mode;
      // Encontrar la variante específica
      const variantItem = product.variants.items.find(it => {
        const sizeMatch = mode === 'color_only' || (it.size === size);
        const colorMatch = mode === 'size_only' || (it.color === color);
        return sizeMatch && colorMatch;
      });
      if (!variantItem) {
        return NextResponse.json({
          error: 'Esta combinación de talla/color no existe',
          available: 0,
        }, { status: 409 });
      }
      baseStock = Number(variantItem.stock) || 0;
    } else {
      baseStock = Number(product.stock) || 0;
    }

    // Reservas activas para el mismo producto+variante
    let reservationQuery = supabaseAdmin
      .from('stock_reservations')
      .select('qty, size, color')
      .eq('product_id', productId)
      .eq('status', 'pending');

    const { data: activeReservations } = await reservationQuery;

    // Filtrar reservas que coincidan con la variante específica
    const matchingReservations = (activeReservations || []).filter(r => {
      if (productHasVariants) {
        const mode = product.variants.mode;
        const sizeMatch = mode === 'color_only' || (r.size === size);
        const colorMatch = mode === 'size_only' || (r.color === color);
        return sizeMatch && colorMatch;
      }
      // Sin variantes: cualquier reserva del producto cuenta
      return true;
    });

    const reservedQty = matchingReservations.reduce((s, r) => s + (r.qty || 0), 0);
    const availableStock = baseStock - reservedQty;

    if (availableStock < qty) {
      return NextResponse.json({
        error: 'Stock insuficiente',
        available: availableStock,
      }, { status: 409 });
    }

    // ── 5. Calcular precio (con descuento si aplica) ──
    const basePrice = Number(product.price) || 0;
    const discount = Number(product.discount) || 0;
    const priceUnit = discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
    const total = priceUnit * qty;

    // ── 6. Crear reserva temporal ──
    const { data: reservation, error: resError } = await supabaseAdmin
      .from('stock_reservations')
      .insert({
        product_id: productId,
        size: size || null,
        color: color || null,
        qty,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_doc: customerDoc || null,
        customer_address: customerAddress || null,
        customer_city: customerCity || null,
        customer_notes: customerNotes || null,
        price_unit: priceUnit,
        total,
        status: 'pending',
      })
      .select()
      .single();

    if (resError) {
      console.error('Error creando reserva:', resError);
      return NextResponse.json({ error: 'No se pudo crear la reserva' }, { status: 500 });
    }

    // ── 7. Crear preferencia en Mercado Pago ──
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://splendoracol.site';

    const preference = new Preference(mpClient);
    const prefData = await preference.create({
      body: {
        items: [
          {
            id: product.id,
            title: `${product.name}${size ? ` - Talla ${size}` : ''}${color ? ` - ${color}` : ''}`,
            quantity: qty,
            unit_price: priceUnit,
            currency_id: 'COP',
          },
        ],
        payer: {
          name: customerName,
          phone: { number: customerPhone },
        },
        back_urls: {
          success: `${baseUrl}/pago/exito?r=${reservation.id}`,
          pending: `${baseUrl}/pago/pendiente?r=${reservation.id}`,
          failure: `${baseUrl}/pago/error?r=${reservation.id}`,
        },
        auto_return: 'approved',
        external_reference: reservation.id,
        notification_url: `${baseUrl}/api/mp/webhook`,
        statement_descriptor: 'SPLENDORA',
      },
    });

    // ── 8. Guardar preference_id en la reserva ──
    await supabaseAdmin
      .from('stock_reservations')
      .update({ mp_preference_id: prefData.id })
      .eq('id', reservation.id);

    // ── 9. Devolver al cliente el link de pago ──
    return NextResponse.json({
      success: true,
      reservationId: reservation.id,
      preferenceId: prefData.id,
      initPoint: prefData.init_point,
      expiresAt: reservation.expires_at,
    });

  } catch (err) {
    console.error('Error en create-preference:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
