'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Email o contraseña incorrectos');
    } else {
      window.location.href = '/';
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", padding: 20 }}>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#1A1D23', letterSpacing: 2, marginBottom: 4 }}>SPLENDORA</div>
        <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 4, marginBottom: 40 }}>C O L</div>

        <div className="neu-card" style={{ padding: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Iniciar sesión</div>

          {error && <div style={{ background: '#FEE2E2', color: '#C0504E', padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 16 }}>{error}</div>}

          <div style={{ marginBottom: 16 }}>
            <label className="label">Email</label>
            <input className="neu-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Contraseña</label>
            <input className="neu-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={handleLogin} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 20 }}>Solo acceso autorizado</div>
      </div>
    </div>
  );
}
