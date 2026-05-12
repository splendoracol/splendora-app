'use client';

import { Suspense } from 'react';
import Link from 'next/link';

function ErrorContent() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
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
          background: '#EF4444', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, color: '#FFF',
        }}>
          ✕
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1A1D23', marginBottom: 10 }}>
          Pago no procesado
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 }}>
          Tu pago no se pudo procesar. No te preocupes, no se hizo ningún cobro.
        </p>

        <div style={{ padding: 15, background: '#FEE2E2', borderRadius: 10, marginBottom: 20, fontSize: 12, color: '#991B1B', textAlign: 'left' }}>
          <strong>Posibles razones:</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0, lineHeight: 1.6 }}>
            <li>La tarjeta fue rechazada por tu banco</li>
            <li>Fondos insuficientes</li>
            <li>Datos incorrectos al pagar</li>
            <li>Cancelaste el pago</li>
          </ul>
        </div>

        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
          Puedes intentar de nuevo o contactarnos por WhatsApp para pagar por transferencia.
        </p>

        <Link href="/catalogo" style={{
          display: 'block', padding: '14px 20px', background: '#1A1D23',
          color: '#FFF', borderRadius: 10, textDecoration: 'none',
          fontWeight: 700, fontSize: 14, marginBottom: 10,
        }}>
          Volver al catálogo
        </Link>

        <a
          href="https://wa.me/573172346822?text=Hola%2C+tuve+un+problema+con+el+pago+por+Mercado+Pago"
          style={{
            display: 'block', padding: '14px 20px', background: '#25D366',
            color: '#FFF', borderRadius: 10, textDecoration: 'none',
            fontWeight: 700, fontSize: 14,
          }}>
          💬 Pagar por WhatsApp
        </a>

        <div style={{ marginTop: 25, fontSize: 10, color: '#9CA3AF' }}>
          SPLENDORA
        </div>
      </div>
    </div>
  );
}

export default function PagoErrorPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Cargando…</div>}>
      <ErrorContent />
    </Suspense>
  );
}
