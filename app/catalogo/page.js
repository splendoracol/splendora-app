'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const CATEGORIES = ["Blusas","Pantalones","Vestidos","Faldas","Conjuntos","Accesorios","Zapatos","Bolsos","Otro"];
const cur = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n || 0);

// ── Photo viewer with arrows ──
function PhotoNav({ photos, big }) {
  const [idx, setIdx] = useState(0);
  if (!photos || photos.length === 0) {
    return <span style={{ fontSize: big ? 60 : 44, color: '#D1D3D6' }}>+</span>;
  }
  const h = big ? 320 : 180;
  return (
    <div style={{ position: 'relative', width: '100%', height: h }}>
      <img src={photos[idx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: big ? 14 : 12 }} />
      {photos.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setIdx(idx === 0 ? photos.length - 1 : idx - 1); }}
            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', color: '#FFF', border: 'none', borderRadius: '50%', width: big ? 32 : 24, height: big ? 32 : 24, cursor: 'pointer', fontSize: big ? 16 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ‹
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIdx(idx === photos.length - 1 ? 0 : idx + 1); }}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', color: '#FFF', border: 'none', borderRadius: '50%', width: big ? 32 : 24, height: big ? 32 : 24, cursor: 'pointer', fontSize: big ? 16 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ›
          </button>
          <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            {photos.map((_, i) => (
              <div key={i} style={{ width: big ? 8 : 6, height: big ? 8 : 6, borderRadius: '50%', background: i === idx ? '#FFF' : 'rgba(255,255,255,0.5)', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Product detail modal ──
function ProductModal({ product, onClose, wa, onAddCart, onWhatsApp, selectedSize, onSizeChange }) {
  if (!product) return null;
  const p = product;
  const photos = [p.photo_url, p.photo_url_2].filter(Boolean);
  const disc = p.discount > 0;
  const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
  const allSizes = p.sizes && p.sizes.length > 0 ? p.sizes : [p.size];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#F0F2F5', borderRadius: 20, width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Close button */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
          <button onClick={onClose} style={{
            background: 'rgba(0,0,0,0.5)', color: '#FFF', border: 'none', borderRadius: '50%',
            width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Large photo */}
        <div style={{ margin: '-20px 12px 0', borderRadius: 14, overflow: 'hidden', boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF' }}>
          <PhotoNav photos={photos} big />
        </div>

        {/* Discount badge */}
        {disc && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '12px 20px 0' }}>
            <span style={{ background: '#C0504E', color: '#FFF', fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 8 }}>-{p.discount}% OFF</span>
          </div>
        )}

        <div style={{ padding: '12px 20px 20px' }}>
          <div style={{ fontSize: 9, color: '#4A6FA5', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{p.code}</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{p.category}</div>
          {p.color && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Color: {p.color}</div>}
          {p.description && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10, lineHeight: 1.5 }}>{p.description}</div>}

          {/* Price */}
          {!p.hide_price ? (
            <div style={{ marginBottom: 14 }}>
              {disc && <div style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'line-through' }}>{cur(p.price)}</div>}
              <div style={{ fontSize: 26, fontWeight: 800, color: disc ? '#C0504E' : '#1A1D23' }}>{cur(fp)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: '#4A6FA5', fontWeight: 700, marginBottom: 14 }}>Consultar precio 💬</div>
          )}

          {/* Size selector */}
          {allSizes.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Selecciona tu talla</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {allSizes.map(s => (
                  <button key={s} onClick={() => onSizeChange(p.id, s)} style={{
                    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                    fontFamily: "'Montserrat', sans-serif",
                    background: selectedSize === s ? '#1A1D23' : '#F0F2F5', color: selectedSize === s ? '#FFF' : '#6B7280',
                    boxShadow: selectedSize === s ? 'none' : 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => onWhatsApp(p)} style={{
              width: '100%', padding: '13px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif",
            }}>💬 Preguntar por WhatsApp</button>
            <button onClick={() => onAddCart(p)} style={{
              width: '100%', padding: '13px', background: '#F0F2F5', color: '#1A1D23', border: 'none', borderRadius: 12,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif",
              boxShadow: '3px 3px 6px #D1D3D6, -3px -3px 6px #FFFFFF',
            }}>🛒 Agregar al carrito</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cart drawer ──
function CartDrawer({ cart, onClose, onRemove, wa, sizes }) {
  if (cart.length === 0) return null;

  function sendAll() {
    let msg = `Hola! Me interesan estos productos de SPLENDORA.COL:\n\n`;
    cart.forEach((p, i) => {
      const sz = sizes[p.id] || (p.sizes && p.sizes.length > 0 ? p.sizes[0] : p.size);
      const disc = p.discount > 0;
      const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
      const pr = p.hide_price ? 'Consultar precio' : cur(fp);
      msg += `${i + 1}. *${p.name}*\n   Ref: ${p.code} · Talla: ${sz}\n   Precio: ${pr}\n`;
      if (p.photo_url) msg += `   Foto: ${p.photo_url}\n`;
      msg += '\n';
    });
    msg += `Total: ${cart.length} producto(s)\n\n¿Están disponibles? 🛍`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
      background: '#FFF', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
      padding: '16px 20px max(16px, env(safe-area-inset-bottom))', maxHeight: '50vh', overflow: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>🛒 Carrito ({cart.length})</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6B7280' }}>×</button>
      </div>
      {cart.map((p, i) => {
        const sz = sizes[p.id] || (p.sizes && p.sizes.length > 0 ? p.sizes[0] : p.size);
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < cart.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, boxShadow: 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
              {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D1D3D6' }}>+</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{p.name}</div>
              <div style={{ fontSize: 9, color: '#6B7280' }}>{p.code} · Talla: {sz}</div>
            </div>
            {!p.hide_price && <div style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{cur(p.discount > 0 ? Math.round(p.price * (1 - p.discount / 100)) : p.price)}</div>}
            <button onClick={() => onRemove(p.id)} style={{ background: 'none', border: 'none', color: '#C0504E', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>
        );
      })}
      <button onClick={sendAll} style={{
        width: '100%', padding: '13px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 12,
        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", marginTop: 12,
      }}>💬 Enviar todo por WhatsApp ({cart.length} productos)</button>
    </div>
  );
}

// ════════════════════════
// MAIN CATALOG PAGE
// ════════════════════════
export default function CatalogoPage() {
  const [products, setProducts] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [filter, setFilter] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [sizes, setSizes] = useState({});
  const [selected, setSelected] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('products').select('*').gt('stock', 0).order('created_at', { ascending: false }),
        supabase.from('catalog_config').select('*').eq('id', 1).single(),
      ]);
      setProducts(p || []);
      setCfg(c || {});
      setLoading(false);
    })();
  }, []);

  const filtered = products.filter(p => filter === 'Todas' || p.category === filter);
  const wa = cfg?.whatsapp_number || '573172346822';
  const ig = cfg?.instagram_url || 'https://www.instagram.com/splendora.col';
  const logo = cfg?.logo_url || '';

  function getPhotos(p) {
    return [p.photo_url, p.photo_url_2].filter(Boolean);
  }

  function sendWA(p) {
    const sz = sizes[p.id] || (p.sizes && p.sizes.length > 0 ? p.sizes[0] : p.size);
    const disc = p.discount > 0;
    const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
    const pr = p.hide_price ? 'Consultar precio' : (disc ? `${cur(fp)} (antes ${cur(p.price)} - ${p.discount}% OFF)` : cur(p.price));
    const msg = `Hola! Me interesa este producto de SPLENDORA.COL:\n\n*${p.name}*\nRef: ${p.code}\n${p.category}\nTalla: ${sz}\n${p.color ? `Color: ${p.color}\n` : ''}Precio: ${pr}\n${p.description || ''}\n${p.photo_url ? `\nFoto: ${p.photo_url}\n` : ''}\nEsta disponible?`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function addToCart(p) {
    if (cart.find(x => x.id === p.id)) {
      alert('Ya está en el carrito');
      return;
    }
    setCart(prev => [...prev, p]);
    setSelected(null);
    setShowCart(true);
  }

  function removeFromCart(id) {
    setCart(prev => prev.filter(x => x.id !== id));
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          {logo && <img src={logo} alt="" style={{ width: 50, marginBottom: 8 }} />}
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 3, marginTop: 4 }}>Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: "'Montserrat', sans-serif", color: '#1A1D23', paddingBottom: cart.length > 0 && showCart ? 200 : 0 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* HEADER + LOGO */}
      <div style={{ background: '#FFF', padding: '20px 20px 14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {logo && <img src={logo} alt="SPLENDORA.COL" style={{ width: 50, height: 50, objectFit: 'contain', marginBottom: 6 }} />}
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>SPLENDORA</div>
        <div style={{ fontSize: 8, color: '#9CA3AF', letterSpacing: 5, marginTop: 1 }}>C O L</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
          <a href={ig} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4A6FA5', textDecoration: 'none', fontWeight: 600 }}>📸 Instagram</a>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>💬 WhatsApp</a>
        </div>
      </div>

      {/* BANNER */}
      {cfg && cfg.banner_active && (cfg.banner_text || cfg.banner_image) && (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {cfg.banner_image && (
            <div style={{ width: '100%', height: 180, overflow: 'hidden' }}>
              <img src={cfg.banner_image} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          {cfg.banner_text && (
            <div style={{
              ...(cfg.banner_image ? { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '24px 20px 16px' } : { background: 'linear-gradient(135deg, #1A1D23, #2D3748)', padding: '16px 20px' }),
              textAlign: 'center',
            }}>
              <div style={{ color: '#FFF', fontSize: 14, fontWeight: 700 }}>{cfg.banner_text}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '16px 16px 40px' }}>
        {/* CATEGORIES */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['Todas', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: "'Montserrat', sans-serif",
              background: filter === c ? '#1A1D23' : '#F0F2F5', color: filter === c ? '#FFF' : '#6B7280',
              boxShadow: filter === c ? 'none' : '3px 3px 6px #D1D3D6, -3px -3px 6px #FFFFFF',
            }}>{c}</button>
          ))}
        </div>

        {/* PRODUCTS GRID */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, borderRadius: 16, boxShadow: '5px 5px 10px #D1D3D6, -5px -5px 10px #FFFFFF' }}>
            <div style={{ color: '#9CA3AF' }}>No hay productos disponibles</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 14 }}>
            {filtered.map(p => {
              const disc = p.discount > 0;
              const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
              const photos = getPhotos(p);
              const inCart = cart.find(x => x.id === p.id);

              return (
                <div key={p.id} onClick={() => setSelected(p)} style={{
                  background: '#F0F2F5', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                  boxShadow: '5px 5px 10px #D1D3D6, -5px -5px 10px #FFFFFF', position: 'relative',
                  border: inCart ? '2px solid #25D366' : '2px solid transparent',
                }}>
                  {disc && <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, background: '#C0504E', color: '#FFF', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6 }}>-{p.discount}%</div>}
                  {inCart && <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, background: '#25D366', color: '#FFF', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>🛒</div>}

                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: 8, borderRadius: 12, boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF' }}>
                    <PhotoNav photos={photos} />
                  </div>

                  <div style={{ padding: '8px 14px 14px' }}>
                    <div style={{ fontSize: 8, color: '#4A6FA5', fontWeight: 700 }}>{p.code}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 9, color: '#6B7280' }}>{p.category}</div>
                    {!p.hide_price ? (
                      <div style={{ marginTop: 4 }}>
                        {disc && <span style={{ fontSize: 10, color: '#9CA3AF', textDecoration: 'line-through', marginRight: 6 }}>{cur(p.price)}</span>}
                        <div style={{ fontSize: 17, fontWeight: 800, color: disc ? '#C0504E' : '#1A1D23' }}>{cur(fp)}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#4A6FA5', fontWeight: 600, marginTop: 4 }}>Consultar precio</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FLOATING CART BUTTON */}
      {cart.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)} style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 800,
          background: '#25D366', color: '#FFF', border: 'none', borderRadius: 16,
          padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(37,211,102,0.4)',
          fontFamily: "'Montserrat', sans-serif",
        }}>
          🛒 Carrito ({cart.length})
        </button>
      )}

      {/* PRODUCT DETAIL MODAL */}
      {selected && (
        <ProductModal
          product={selected}
          onClose={() => setSelected(null)}
          wa={wa}
          selectedSize={sizes[selected.id] || (selected.sizes && selected.sizes.length > 0 ? selected.sizes[0] : selected.size)}
          onSizeChange={(id, s) => setSizes(prev => ({ ...prev, [id]: s }))}
          onWhatsApp={(p) => { sendWA(p); setSelected(null); }}
          onAddCart={(p) => addToCart(p)}
        />
      )}

      {/* CART DRAWER */}
      {showCart && cart.length > 0 && (
        <CartDrawer cart={cart} onClose={() => setShowCart(false)} onRemove={removeFromCart} wa={wa} sizes={sizes} />
      )}

      {/* FOOTER */}
      <div style={{ textAlign: 'center', padding: '24px 20px 32px', background: '#FFF', marginTop: 20 }}>
        {logo && <img src={logo} alt="" style={{ width: 40, height: 40, objectFit: 'contain', marginBottom: 8 }} />}
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, marginBottom: 4 }}>SPLENDORA</div>
        <div style={{ fontSize: 8, color: '#9CA3AF', letterSpacing: 4, marginBottom: 14 }}>C O L</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
          <a href={ig} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#4A6FA5', textDecoration: 'none', fontWeight: 600 }}>📸 @splendora.col</a>
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>💬 WhatsApp</a>
        </div>
      </div>
    </div>
  );
}
