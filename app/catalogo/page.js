'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const CATEGORIES = ["Blusas","Pantalones","Vestidos","Faldas","Conjuntos","Accesorios","Zapatos","Bolsos","Otro"];
const cur = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n || 0);

export default function CatalogoPage() {
  const [products, setProducts] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [filter, setFilter] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [sizes, setSizes] = useState({});

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('products').select('*').gt('stock', 0).order('created_at', { ascending: false }),
        supabase.from('catalog_config').select('*').eq('id', 1).single(),
      ]);
      setProducts(p || []); setCfg(c || {}); setLoading(false);
    })();
  }, []);

  const filtered = products.filter(p => filter === 'Todas' || p.category === filter);
  const wa = cfg?.whatsapp_number || '573172346822';
  const ig = cfg?.instagram_url || 'https://www.instagram.com/splendora.col';

  function sendWA(p) {
    const sz = sizes[p.id] || (p.sizes?.length ? p.sizes[0] : p.size);
    const disc = p.discount > 0;
    const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
    const pr = p.hide_price ? 'Consultar precio' : (disc ? `${cur(fp)} (antes ${cur(p.price)} - ${p.discount}% OFF)` : cur(p.price));
    const msg = `Hola! Me interesa este producto de SPLENDORA.COL:\n\n` +
      `*${p.name}*\nRef: ${p.code}\n${p.category}\nTalla: ${sz}\n` +
      (p.color ? `Color: ${p.color}\n` : '') + `Precio: ${pr}\n` +
      (p.description ? `${p.description}\n` : '') +
      (p.photo_url ? `\nFoto: ${p.photo_url}\n` : '') +
      `\nEsta disponible?`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div>
        <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 3, marginTop: 4 }}>Cargando...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: "'Montserrat', sans-serif", color: '#1A1D23' }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ background: '#FFF', padding: '20px 20px 14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 3 }}>SPLENDORA</div>
        <div style={{ fontSize: 8, color: '#9CA3AF', letterSpacing: 5, marginTop: 2 }}>C O L</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
          <a href={ig} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4A6FA5', textDecoration: 'none', fontWeight: 600 }}>Instagram</a>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>WhatsApp</a>
        </div>
      </div>

      {/* BANNER */}
      {cfg?.banner_active && (cfg?.banner_text || cfg?.banner_image) && (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {cfg.banner_image && (
            <div style={{ width: '100%', height: 180, overflow: 'hidden' }}>
              <img src={cfg.banner_image} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          {cfg.banner_text && (
            <div style={{
              ...(cfg.banner_image ? { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '24px 20px 16px' }
                : { background: 'linear-gradient(135deg, #1A1D23, #2D3748)', padding: '16px 20px' }),
              textAlign: 'center',
            }}>
              <div style={{ color: '#FFF', fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>{cfg.banner_text}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '16px 16px 40px' }}>
        {/* FILTERS */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['Todas', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 10, fontWeight: 600,
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Montserrat', sans-serif",
              background: filter === c ? '#1A1D23' : '#F0F2F5', color: filter === c ? '#FFF' : '#6B7280',
              boxShadow: filter === c ? 'none' : '3px 3px 6px #D1D3D6, -3px -3px 6px #FFFFFF',
            }}>{c}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, borderRadius: 16, boxShadow: '5px 5px 10px #D1D3D6, -5px -5px 10px #FFFFFF' }}>
            <div style={{ color: '#9CA3AF' }}>No hay productos disponibles</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 14 }}>
            {filtered.map(p => {
              const disc = p.discount > 0;
              const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
              const allSizes = p.sizes?.length > 0 ? p.sizes : [p.size];
              const curSize = sizes[p.id] || allSizes[0];

              return (
                <div key={p.id} style={{ background: '#F0F2F5', borderRadius: 16, overflow: 'hidden', boxShadow: '5px 5px 10px #D1D3D6, -5px -5px 10px #FFFFFF', position: 'relative' }}>
                  {disc && <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, background: '#C0504E', color: '#FFF', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>-{p.discount}%</div>}

                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: 8, borderRadius: 12, boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF' }}>
                    {p.photo_url ? <img src={p.photo_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} /> : <span style={{ fontSize: 44, color: '#D1D3D6' }}>+</span>}
                  </div>

                  <div style={{ padding: '8px 14px 14px' }}>
                    <div style={{ fontSize: 8, color: '#4A6FA5', fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>{p.code}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>{p.category}</div>
                    {p.color && <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 4 }}>Color: {p.color}</div>}

                    {!p.hide_price ? (
                      <div style={{ marginTop: 4, marginBottom: 8 }}>
                        {disc && <div style={{ fontSize: 11, color: '#9CA3AF', textDecoration: 'line-through' }}>{cur(p.price)}</div>}
                        <div style={{ fontSize: 18, fontWeight: 800, color: disc ? '#C0504E' : '#1A1D23' }}>{cur(fp)}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#4A6FA5', fontWeight: 600, marginTop: 4, marginBottom: 8 }}>Consultar precio</div>
                    )}

                    {allSizes.length > 1 ? (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 8, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Talla</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {allSizes.map(s => (
                            <button key={s} onClick={() => setSizes(prev => ({ ...prev, [p.id]: s }))} style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                              border: 'none', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif",
                              background: curSize === s ? '#1A1D23' : '#F0F2F5', color: curSize === s ? '#FFF' : '#6B7280',
                              boxShadow: curSize === s ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF',
                            }}>{s}</button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 8 }}>Talla: {allSizes[0]}</div>
                    )}

                    <button onClick={() => sendWA(p)} style={{
                      width: '100%', padding: '10px', background: '#25D366', color: '#fff',
                      border: 'none', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', fontFamily: "'Montserrat', sans-serif",
                    }}>💬 Preguntar por WhatsApp</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ textAlign: 'center', padding: '24px 20px 32px', background: '#FFF', marginTop: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, marginBottom: 8 }}>SPLENDORA</div>
        <div style={{ fontSize: 8, color: '#9CA3AF', letterSpacing: 4, marginBottom: 16 }}>C O L</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
          <a href={ig} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4A6FA5', textDecoration: 'none', fontWeight: 600 }}>@splendora.col</a>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>WhatsApp</a>
        </div>
      </div>
    </div>
  );
}
