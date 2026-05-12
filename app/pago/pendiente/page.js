'use client';

import { Suspense } from 'react';
import Link from 'next/link';

function PendienteContent() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
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
          background: '#F59E0B', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, color: '#FFF',
        }}>
          ⏱
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1A1D23', marginBottom: 10 }}>
          Pago pendiente
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 }}>
          Tu pago está siendo procesado. Esto puede tardar unos minutos si pagaste por Efecty, transferencia o PSE.
        </p>

        <div style={{ padding: 15, background: '#FEF3C7', borderRadius: 10, marginBottom: 20, fontSize: 12, color: '#92400E', textAlign: 'left' }}>
          <strong>¿Qué sigue?</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0, lineHeight: 1.6 }}>
            <li>Tu producto queda apartado durante 20 minutos</li>
            <li>Si pagaste en Efecty, completa el pago en el punto físico</li>
            <li>Te notificaremos por WhatsApp cuando se confirme</li>
          </ul>
        </div>

        <a
          href="https://wa.me/573172346822?text=Hola%2C+mi+pago+por+Mercado+Pago+esta+pendiente"
          style={{
            display: 'block', padding: '14px 20px', background: '#25D366',
            color: '#FFF', borderRadius: 10, textDecoration: 'none',
            fontWeight: 700, fontSize: 14, marginBottom: 10,
          }}>
          💬 Consultar por WhatsApp
        </a>

        <Link href="/catalogo" style={{
          display: 'block', padding: '14px 20px', background: '#F0F2F5',
          color: '#1A1D23', borderRadius: 10, textDecoration: 'none',
          fontWeight: 700, fontSize: 14,
        }}>
          Volver al catálogo
        </Link>

        <div style={{ marginTop: 25, fontSize: 10, color: '#9CA3AF' }}>
          SPLENDORA
        </div>
      </div>
    </div>
  );
}

export default function PagoPendientePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Cargando…</div>}>
      <PendienteContent />
    </Suspense>
  );
}
