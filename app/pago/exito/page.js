'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ExitoContent() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const reservationId = searchParams.get('r');
  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');

  useEffect(() => {
    // Esperamos unos segundos para que el webhook procese el pago
    // y luego consultamos el número de pedido desde nuestra API
    if (!reservationId) {
      setLoading(false);
      return;
    }
    let attempts = 0;
    const checkOrder = async () => {
      try {
        const res = await fetch(`/api/mp/check-order?r=${reservationId}`);
        const data = await res.json();
        if (data.orderNumber) {
          setOrderNumber(data.orderNumber);
          setLoading(false);
          return;
        }
      } catch (e) {}
      attempts++;
      if (attempts < 10) {
        setTimeout(checkOrder, 2000);
      } else {
        setLoading(false);
      }
    };
    checkOrder();
  }, [reservationId]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #FFE8EC 0%, #FFD4DC 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'Montserrat, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#FFF', borderRadius: 20, padding: '40px 30px',
        maxWidth: 480, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: '#10B981', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, color: '#FFF',
        }}>
          ✓
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1A1D23', marginBottom: 10 }}>
          ¡Pago exitoso!
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 }}>
          Tu pago ha sido procesado correctamente. Recibirás un mensaje por WhatsApp confirmando el despacho de tu pedido.
        </p>

        {loading && (
          <div style={{ padding: 15, background: '#F9FAFB', borderRadius: 10, marginBottom: 20, fontSize: 12, color: '#6B7280' }}>
            Procesando tu pedido…
          </div>
        )}

        {!loading && orderNumber && (
          <div style={{ padding: 15, background: '#F0FDF4', borderRadius: 10, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Número de pedido</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981' }}>#{orderNumber}</div>
          </div>
        )}

        {!loading && !orderNumber && (
          <div style={{ padding: 15, background: '#FEF3C7', borderRadius: 10, marginBottom: 20, fontSize: 12, color: '#92400E' }}>
            Estamos confirmando tu pago. Si no ves tu pedido en unos minutos, contáctanos por WhatsApp.
          </div>
        )}

        <a
          href="https://wa.me/573172346822?text=Hola%2C+acabo+de+pagar+por+Mercado+Pago"
          style={{
            display: 'block', padding: '14px 20px', background: '#25D366',
            color: '#FFF', borderRadius: 10, textDecoration: 'none',
            fontWeight: 700, fontSize: 14, marginBottom: 10,
          }}>
          💬 Confirmar por WhatsApp
        </a>

        <Link href="/catalogo" style={{
          display: 'block', padding: '14px 20px', background: '#F0F2F5',
          color: '#1A1D23', borderRadius: 10, textDecoration: 'none',
          fontWeight: 700, fontSize: 14,
        }}>
          Volver al catálogo
        </Link>

        <div style={{ marginTop: 25, fontSize: 10, color: '#9CA3AF' }}>
          SPLENDORA — Gracias por tu compra ✨
        </div>
      </div>
    </div>
  );
}

export default function PagoExitoPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Cargando…</div>}>
      <ExitoContent />
    </Suspense>
  );
}
