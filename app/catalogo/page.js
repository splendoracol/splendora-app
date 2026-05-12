'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';

const CATEGORIES_FALLBACK = ["Blusas","Pantalones","Vestidos","Faldas","Conjuntos","Accesorios","Zapatos","Bolsos","Otro"];
const cur = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n || 0);

// Mapa de colores pastel — detecta automáticamente el hex según el nombre
const COLOR_MAP = {
  'negro': '#4A4A4A', 'blanco': '#FAFAFA',
  'rojo': '#F5A3A3', 'rojo pastel': '#F5A3A3',
  'azul': '#A8C8E8', 'azul pastel': '#A8C8E8', 'celeste': '#BEDFF0',
  'rosa': '#F4C2D7', 'rosa pastel': '#F4C2D7', 'rosado': '#F4C2D7', 'fucsia': '#E8A5C0',
  'verde': '#B5D9B5', 'verde pastel': '#B5D9B5', 'menta': '#B8E0D2',
  'amarillo': '#F8E5A1', 'amarillo pastel': '#F8E5A1', 'mostaza': '#E8D078',
  'cafe': '#C9A98E', 'café': '#C9A98E', 'marron': '#B89272', 'marrón': '#B89272',
  'beige': '#F0E4D0', 'crema': '#F4ECDD',
  'gris': '#C8C8C8', 'gris perla': '#D8D8D8',
  'morado': '#C9B0E0', 'lila': '#D5BEE0', 'lavanda': '#D5C5E8', 'violeta': '#C5B0DC',
  'naranja': '#F5C8A8', 'durazno': '#F8C8B0',
  'salmon': '#F5B8A8', 'salmón': '#F5B8A8', 'coral': '#F5B5A8',
  'vinotinto': '#9B4A4A', 'vino': '#9B4A4A',
  'dorado': '#E0C896', 'champagne': '#E8D5B0',
  'plata': '#D0D0D0', 'plateado': '#D0D0D0',
  'turquesa': '#B5DFD8', 'aqua': '#B5DFD8',
  'oliva': '#B8B58A', 'caqui': '#D0C29B', 'nude': '#E8D0BC', 'perla': '#F0EBE0', 'tierra': '#C8AC8A',
};

function getColorHex(name) {
  if (!name) return '#E5E7EB';
  const normalized = String(name).trim().toLowerCase();
  if (COLOR_MAP[normalized]) return COLOR_MAP[normalized];
  for (const key of Object.keys(COLOR_MAP)) {
    if (normalized.includes(key)) return COLOR_MAP[key];
  }
  return '#E5E7EB';
}

function ColorDot({ name, size = 14 }) {
  const hex = getColorHex(name);
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: hex, border: '1px solid rgba(0,0,0,0.15)', verticalAlign: 'middle', flexShrink: 0,
    }} />
  );
}

// ── HELPERS DE VARIANTES ──
// Devuelve true si el producto usa variantes
function hasVariants(product) {
  return !!(product?.variants && Array.isArray(product.variants.items) && product.variants.items.length > 0);
}

// Calcula cuántas unidades están reservadas en este momento para una variante específica.
// Las reservas vienen del endpoint /api/stock/reservations (status='pending' y no expiradas).
function getReservedQty(reservations, productId, size, color, product) {
  if (!reservations || reservations.length === 0) return 0;
  const mode = product?.variants?.mode;
  let total = 0;
  for (const r of reservations) {
    if (r.product_id !== productId) continue;
    // Si el producto tiene variantes, filtrar por la combinación
    if (mode === 'size_color') {
      if (r.size === size && r.color === color) total += (r.qty || 0);
    } else if (mode === 'size_only') {
      if (r.size === size) total += (r.qty || 0);
    } else if (mode === 'color_only') {
      if (r.color === color) total += (r.qty || 0);
    } else {
      // Sin variantes
      total += (r.qty || 0);
    }
  }
  return total;
}

// Devuelve el stock disponible para una combinación específica (size + color)
// Si el producto NO tiene variantes, devuelve product.stock
function getVariantStock(product, size, color) {
  if (!hasVariants(product)) {
    return Number(product?.stock) || 0;
  }
  const mode = product.variants.mode;
  const item = product.variants.items.find(it => {
    const sizeMatch = mode === 'color_only' || (it.size === size);
    const colorMatch = mode === 'size_only' || (it.color === color);
    return sizeMatch && colorMatch;
  });
  return item ? (Number(item.stock) || 0) : 0;
}

// Devuelve las tallas disponibles (con su stock total) para mostrar en el catálogo
// Si producto tiene variantes, retorna tallas únicas del array items
// Si no, retorna product.sizes o [product.size]
function getAvailableSizes(product) {
  if (hasVariants(product)) {
    const mode = product.variants.mode;
    if (mode === 'color_only') return []; // No hay tallas
    const sizesMap = {};
    product.variants.items.forEach(it => {
      if (!it.size) return;
      sizesMap[it.size] = (sizesMap[it.size] || 0) + (Number(it.stock) || 0);
    });
    return Object.keys(sizesMap).map(s => ({ size: s, stock: sizesMap[s] }));
  }
  // Legacy: sin variantes
  const sizesArr = product.sizes && product.sizes.length > 0 ? product.sizes : (product.size ? [product.size] : []);
  return sizesArr.map(s => ({ size: s, stock: Number(product.stock) || 0 }));
}

function getAvailableColors(product) {
  if (hasVariants(product)) {
    const mode = product.variants.mode;
    if (mode === 'size_only') return []; // No hay colores
    const colorsMap = {};
    product.variants.items.forEach(it => {
      if (!it.color) return;
      colorsMap[it.color] = (colorsMap[it.color] || 0) + (Number(it.stock) || 0);
    });
    return Object.keys(colorsMap).map(c => ({ color: c, stock: colorsMap[c] }));
  }
  // Legacy: sin variantes
  const colorsArr = product.colors && product.colors.length > 0 ? product.colors : (product.color ? [product.color] : []);
  return colorsArr.map(c => ({ color: c, stock: Number(product.stock) || 0 }));
}

// Verifica si una combinación específica tiene stock
function isCombinationAvailable(product, size, color) {
  return getVariantStock(product, size, color) > 0;
}

function PhotoNav({ photos, big }) {
  const [idx, setIdx] = useState(0);
  if (!photos || photos.length === 0) return <span style={{ fontSize: big ? 60 : 44, color: '#D1D3D6' }}>+</span>;
  return (
    <div style={{ position: 'relative', width: '100%', height: big ? 320 : 180 }}>
      <Image
        src={photos[idx]}
        alt=""
        fill
        sizes={big ? '(max-width: 600px) 100vw, 400px' : '(max-width: 600px) 50vw, 200px'}
        style={{ objectFit: 'cover', borderRadius: big ? 14 : 12 }}
        quality={80}
      />
      {photos.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); setIdx(idx === 0 ? photos.length - 1 : idx - 1); }}
            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', color: '#FFF', border: 'none', borderRadius: '50%', width: big ? 32 : 24, height: big ? 32 : 24, cursor: 'pointer', fontSize: big ? 16 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>‹</button>
          <button onClick={e => { e.stopPropagation(); setIdx(idx === photos.length - 1 ? 0 : idx + 1); }}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', color: '#FFF', border: 'none', borderRadius: '50%', width: big ? 32 : 24, height: big ? 32 : 24, cursor: 'pointer', fontSize: big ? 16 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>›</button>
          <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 2 }}>
            {photos.map((_, i) => <div key={i} style={{ width: big ? 8 : 6, height: big ? 8 : 6, borderRadius: '50%', background: i === idx ? '#FFF' : 'rgba(255,255,255,0.5)', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ProductModal({ product, onClose, wa, onAddCart, onWhatsApp, onPayMP, selectedSize, onSizeChange, selectedColor, onColorChange, selectedQty, onQtyChange, reservations }) {
  if (!product) return null;
  const p = product;
  const photos = [p.photo_url, p.photo_url_2, ...(p.extra_photos || [])].filter(Boolean);
  const disc = p.discount > 0;
  const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;

  // ── NUEVAS HELPERS DE VARIANTES ──
  const useVariants = hasVariants(p);
  const sizesWithStock = getAvailableSizes(p);
  const colorsWithStock = getAvailableColors(p);
  const allSizes = sizesWithStock.map(x => x.size);
  const allColors = colorsWithStock.map(x => x.color);

  // Stock base de la combinación actual elegida
  const baseStock = useVariants
    ? getVariantStock(p, selectedSize, selectedColor)
    : (Number(p.stock) || 0);
  // Cuánto está reservado por otros clientes en este momento
  const reservedQty = getReservedQty(reservations, p.id, selectedSize, selectedColor, p);
  // Stock REAL disponible (lo que el cliente puede comprar AHORA)
  const currentStock = Math.max(0, baseStock - reservedQty);
  // ¿La variante existe pero está totalmente reservada?
  const isReservedByOthers = baseStock > 0 && currentStock === 0;
  const isOutOfStock = currentStock <= 0;

  // ¿Una talla tiene stock en alguna combinación? (sin importar color)
  function sizeHasStock(size) {
    if (!useVariants) return true;
    if (p.variants.mode === 'color_only') return true;
    return sizesWithStock.find(x => x.size === size)?.stock > 0;
  }

  // ¿Un color tiene stock en alguna combinación? (sin importar talla)
  function colorHasStock(color) {
    if (!useVariants) return true;
    if (p.variants.mode === 'size_only') return true;
    return colorsWithStock.find(x => x.color === color)?.stock > 0;
  }

  // Al hacer clic en una talla: si la combinación con el color actual no tiene stock,
  // ajusta automáticamente el color a uno que SÍ tenga stock para esa talla
  function handleSizeClick(size) {
    onSizeChange(p.id, size);
    onQtyChange(p.id, 1); // resetear cantidad porque cambia el stock disponible
    if (useVariants && p.variants.mode === 'size_color') {
      const currentColor = selectedColor;
      if (!currentColor || getVariantStock(p, size, currentColor) <= 0) {
        // Buscar primer color con stock para esa talla
        const compatibleColor = p.variants.items.find(it => it.size === size && (Number(it.stock) || 0) > 0)?.color;
        if (compatibleColor) onColorChange(p.id, compatibleColor);
      }
    }
  }

  // Al hacer clic en un color: si la combinación con la talla actual no tiene stock,
  // ajusta automáticamente la talla a una que SÍ tenga stock para ese color
  function handleColorClick(color) {
    onColorChange(p.id, color);
    onQtyChange(p.id, 1); // resetear cantidad porque cambia el stock disponible
    if (useVariants && p.variants.mode === 'size_color') {
      const currentSize = selectedSize;
      if (!currentSize || getVariantStock(p, currentSize, color) <= 0) {
        const compatibleSize = p.variants.items.find(it => it.color === color && (Number(it.stock) || 0) > 0)?.size;
        if (compatibleSize) onSizeChange(p.id, compatibleSize);
      }
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F0F2F5', borderRadius: 20, width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
          <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)', color: '#FFF', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ margin: '-20px 12px 0', borderRadius: 14, overflow: 'hidden', boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF' }}>
          <PhotoNav photos={photos} big />
        </div>
        {disc && <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '12px 20px 0' }}><span style={{ background: '#C0504E', color: '#FFF', fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 8 }}>-{p.discount}% OFF</span></div>}
        <div style={{ padding: '12px 20px 20px' }}>
          <div style={{ fontSize: 9, color: '#4A6FA5', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{p.code}</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{(p.categories || [p.category]).join(' · ')}</div>
          {p.description && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10, lineHeight: 1.6, marginTop: 8, padding: '8px 12px', background: '#E8EAED', borderRadius: 8 }}>{p.description}</div>}

          {!p.hide_price ? (
            <div style={{ marginBottom: 14 }}>
              {disc && <div style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'line-through' }}>{cur(p.price)}</div>}
              <div style={{ fontSize: 26, fontWeight: 800, color: disc ? '#C0504E' : '#1A1D23' }}>{cur(fp)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 16, color: '#4A6FA5', fontWeight: 700, marginBottom: 14 }}>Consultar precio 💬</div>
          )}

          {/* SIZE SELECTOR */}
          {allSizes.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Talla</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {allSizes.map(s => {
                  const hasStock = sizeHasStock(s);
                  const isSelected = selectedSize === s;
                  return (
                    <button key={s} onClick={() => hasStock && handleSizeClick(s)}
                      disabled={!hasStock}
                      style={{
                        padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none',
                        cursor: hasStock ? 'pointer' : 'not-allowed', fontFamily: "'Montserrat', sans-serif",
                        background: isSelected ? '#1A1D23' : (hasStock ? '#F0F2F5' : '#E5E7EB'),
                        color: isSelected ? '#FFF' : (hasStock ? '#6B7280' : '#9CA3AF'),
                        boxShadow: isSelected ? 'none' : 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
                        textDecoration: hasStock ? 'none' : 'line-through',
                        opacity: hasStock ? 1 : 0.6,
                      }}>{s}</button>
                  );
                })}
              </div>
            </div>
          )}
          {allSizes.length === 1 && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Talla: {allSizes[0]}</div>}

          {/* COLOR SELECTOR */}
          {allColors.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Color</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {allColors.map(c => {
                  const hasStock = colorHasStock(c);
                  const isSelected = selectedColor === c;
                  return (
                    <button key={c} onClick={() => hasStock && handleColorClick(c)}
                      disabled={!hasStock}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none',
                        cursor: hasStock ? 'pointer' : 'not-allowed', fontFamily: "'Montserrat', sans-serif",
                        background: isSelected ? '#1A1D23' : (hasStock ? '#F0F2F5' : '#E5E7EB'),
                        color: isSelected ? '#FFF' : (hasStock ? '#6B7280' : '#9CA3AF'),
                        boxShadow: isSelected ? 'none' : 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
                        textDecoration: hasStock ? 'none' : 'line-through',
                        opacity: hasStock ? 1 : 0.6,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                      <ColorDot name={c} size={12} />
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {allColors.length === 1 && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Color: {allColors[0]}</div>}

          {/* Aviso si la variante está totalmente reservada por otros */}
          {isReservedByOthers && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>⏱</span>
              <div>
                <div>Otra persona está pagando esta combinación.</div>
                <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2 }}>Si no completa el pago en máx. 10 minutos, volverá a estar disponible.</div>
              </div>
            </div>
          )}

          {/* Aviso si la combinación no existe / sin stock real */}
          {useVariants && isOutOfStock && !isReservedByOthers && selectedSize && selectedColor && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              ⚠ Combinación agotada. Elige otra talla o color.
            </div>
          )}

          {/* SELECTOR DE CANTIDAD — solo si hay stock */}
          {!isOutOfStock && currentStock > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Cantidad</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#F0F2F5', borderRadius: 12, boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF' }}>
                  <button
                    onClick={() => selectedQty > 1 && onQtyChange(p.id, selectedQty - 1)}
                    disabled={selectedQty <= 1}
                    style={{
                      width: 38, height: 38, background: 'transparent', border: 'none',
                      fontSize: 18, fontWeight: 700, color: selectedQty > 1 ? '#1A1D23' : '#9CA3AF',
                      cursor: selectedQty > 1 ? 'pointer' : 'not-allowed',
                      fontFamily: "'Montserrat', sans-serif",
                    }}>−</button>
                  <div style={{ minWidth: 36, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#1A1D23' }}>{selectedQty}</div>
                  <button
                    onClick={() => selectedQty < currentStock && onQtyChange(p.id, selectedQty + 1)}
                    disabled={selectedQty >= currentStock}
                    style={{
                      width: 38, height: 38, background: 'transparent', border: 'none',
                      fontSize: 18, fontWeight: 700, color: selectedQty < currentStock ? '#1A1D23' : '#9CA3AF',
                      cursor: selectedQty < currentStock ? 'pointer' : 'not-allowed',
                      fontFamily: "'Montserrat', sans-serif",
                    }}>+</button>
                </div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>
                  {currentStock === 1 ? 'Última unidad' : `${currentStock} disponibles`}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!p.hide_price && (
              <button onClick={() => !isOutOfStock && onPayMP(p)}
                disabled={isOutOfStock}
                style={{
                  width: '100%', padding: '14px',
                  background: isOutOfStock ? '#D1D5DB' : 'linear-gradient(135deg, #00B1EA 0%, #009EE3 100%)',
                  color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 800,
                  cursor: isOutOfStock ? 'not-allowed' : 'pointer', fontFamily: "'Montserrat', sans-serif",
                  boxShadow: isOutOfStock ? 'none' : '0 4px 12px rgba(0,158,227,0.3)',
                  opacity: isOutOfStock ? 0.7 : 1,
                }}>
                {isOutOfStock
                  ? (isReservedByOthers ? '⏱ Reservado temporalmente' : '⚠ Sin stock')
                  : (selectedQty > 1 ? `💳 Pagar ${cur(fp * selectedQty)} (${selectedQty} unid.)` : '💳 Pagar con Mercado Pago')}
              </button>
            )}
            <button onClick={() => onWhatsApp(p)} style={{ width: '100%', padding: '13px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif" }}>💬 Preguntar por WhatsApp</button>
            <button onClick={() => onAddCart(p)} style={{ width: '100%', padding: '13px', background: '#F0F2F5', color: '#1A1D23', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", boxShadow: '3px 3px 6px #D1D3D6, -3px -3px 6px #FFFFFF' }}>🛒 Agregar al carrito</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutModal({ product, size, color, qty = 1, onClose }) {
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', customerEmail: '', customerDoc: '',
    customerAddress: '', customerCity: '', customerNotes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Contador de 10 minutos para completar el pago ──
  const TOTAL_SECONDS = 10 * 60; // 10 minutos
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (loading) return; // No correr contador mientras está procesando
    if (secondsLeft <= 0) {
      setExpired(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, loading]);

  if (!product) return null;
  const disc = product.discount > 0;
  const fp = disc ? Math.round(product.price * (1 - product.discount / 100)) : product.price;

  // Verificar stock de la combinación
  const useVariants = hasVariants(product);
  const currentStock = useVariants ? getVariantStock(product, size, color) : (Number(product.stock) || 0);
  const isOutOfStock = currentStock <= 0;

  // Formato del contador MM:SS
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const timeColor = secondsLeft <= 60 ? '#DC2626' : (secondsLeft <= 180 ? '#D97706' : '#10B981');

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  // Validación simple de email
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleSubmit() {
    // Validación
    if (expired) return setError('La reserva expiró. Cierra y vuelve a intentar.');
    if (isOutOfStock) return setError('Esta combinación ya no tiene stock');
    if (!form.customerName.trim()) return setError('Tu nombre es requerido');
    if (!form.customerPhone.trim()) return setError('Tu celular es requerido');
    if (form.customerPhone.replace(/\D/g, '').length < 7) return setError('Celular inválido');
    if (!form.customerEmail.trim()) return setError('Tu correo electrónico es requerido');
    if (!isValidEmail(form.customerEmail.trim())) return setError('Correo electrónico inválido');
    if (!form.customerAddress.trim()) return setError('La dirección es requerida');
    if (!form.customerCity.trim()) return setError('La ciudad es requerida');

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/mp/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          size: size || null,
          color: color || null,
          qty: qty,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim().toLowerCase(),
          customerDoc: form.customerDoc.trim() || null,
          customerAddress: form.customerAddress.trim(),
          customerCity: form.customerCity.trim(),
          customerNotes: form.customerNotes.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError('Lo sentimos, este producto se acaba de agotar 😔');
        } else {
          setError(data.error || 'Error al crear el pago. Intenta de nuevo.');
        }
        setLoading(false);
        return;
      }

      // Redirigir a Mercado Pago
      if (data.initPoint) {
        window.location.href = data.initPoint;
      } else {
        setError('No se pudo generar el link de pago');
        setLoading(false);
      }
    } catch (e) {
      setError('Error de conexión. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 20, width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#FFF', padding: '16px 20px 10px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, color: '#009EE3', fontWeight: 800, letterSpacing: 1 }}>PAGAR CON MERCADO PAGO</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>Datos para envío</div>
          </div>
          <button onClick={onClose} style={{ background: '#F0F2F5', color: '#6B7280', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Contador prominente */}
        <div style={{ padding: '10px 20px', background: expired ? '#FEE2E2' : '#F0FDF4', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: expired ? '#991B1B' : '#065F46', fontWeight: 600 }}>
            {expired ? '⏱ Reserva expirada' : '⏱ Tu producto está apartado'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: expired ? '#991B1B' : timeColor, fontFamily: 'monospace' }}>
            {expired ? '00:00' : timeStr}
          </div>
        </div>

        {/* Resumen del producto */}
        <div style={{ padding: '14px 20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>{product.code}</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{product.name}</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
            {size && <>Talla: <strong>{size}</strong></>}
            {size && color && <> · </>}
            {color && <>Color: <strong>{color}</strong></>}
            {qty > 1 && <> · Cantidad: <strong>{qty}</strong></>}
          </div>
          {qty > 1 && (
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
              {cur(fp)} × {qty} unidades
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Total a pagar</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#009EE3' }}>{cur(fp * qty)}</span>
          </div>
        </div>

        {/* Formulario */}
        <div style={{ padding: '16px 20px' }}>
          <Field label="Nombre completo *" value={form.customerName} onChange={v => update('customerName', v)} disabled={loading || expired} />
          <Field label="Celular *" value={form.customerPhone} onChange={v => update('customerPhone', v)} type="tel" placeholder="3001234567" disabled={loading || expired} />
          <Field label="Correo electrónico *" value={form.customerEmail} onChange={v => update('customerEmail', v)} type="email" placeholder="tucorreo@ejemplo.com" disabled={loading || expired} />
          <Field label="Cédula" value={form.customerDoc} onChange={v => update('customerDoc', v)} type="tel" placeholder="Opcional" disabled={loading || expired} />
          <Field label="Dirección de entrega *" value={form.customerAddress} onChange={v => update('customerAddress', v)} placeholder="Calle, número, barrio" disabled={loading || expired} />
          <Field label="Ciudad *" value={form.customerCity} onChange={v => update('customerCity', v)} disabled={loading || expired} />
          <Field label="Notas (opcional)" value={form.customerNotes} onChange={v => update('customerNotes', v)} placeholder="Algo más que debamos saber" disabled={loading || expired} />

          {error && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              ⚠ {error}
            </div>
          )}

          {expired ? (
            <div style={{ padding: '12px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: '#92400E', marginTop: 12, lineHeight: 1.5, fontWeight: 600 }}>
              Tu reserva expiró. El producto volvió a estar disponible para otros clientes. Cierra esta ventana e intenta de nuevo si todavía está disponible.
            </div>
          ) : (
            <div style={{ padding: '10px 12px', background: '#EFF6FF', borderRadius: 8, fontSize: 11, color: '#1E40AF', marginTop: 12, lineHeight: 1.5 }}>
              <strong>🔒 Pago seguro</strong><br />
              Te llevaremos a Mercado Pago. Tienes 10 minutos para completar el pago.
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading || expired} style={{
            width: '100%', marginTop: 14, padding: '14px',
            background: (loading || expired) ? '#9CA3AF' : 'linear-gradient(135deg, #00B1EA 0%, #009EE3 100%)',
            color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800,
            cursor: (loading || expired) ? 'not-allowed' : 'pointer', fontFamily: "'Montserrat', sans-serif",
            boxShadow: (loading || expired) ? 'none' : '0 4px 12px rgba(0,158,227,0.3)',
          }}>
            {expired ? '⏱ Reserva expirada' : (loading ? 'Generando pago…' : `💳 Pagar ${cur(fp * qty)}`)}
          </button>

          <button onClick={onClose} disabled={loading} style={{
            width: '100%', marginTop: 8, padding: '12px', background: 'transparent',
            color: '#6B7280', border: 'none', borderRadius: 12, fontSize: 12, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', fontFamily: "'Montserrat', sans-serif",
          }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', disabled }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
          fontSize: 13, fontFamily: "'Montserrat', sans-serif", outline: 'none',
          background: disabled ? '#F9FAFB' : '#FFF',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function CartDrawer({ cart, onClose, onRemove, wa, sizes, colors }) {
  if (cart.length === 0) return null;
  function sendAll() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    let msg = `Hola! Me interesan estos productos de SPLENDORA.COL:\n\n`;
    cart.forEach((p, i) => {
      const sz = sizes[p.id] || (p.sizes && p.sizes.length > 0 ? p.sizes[0] : p.size);
      const cl = colors[p.id] || (p.colors && p.colors.length > 0 ? p.colors[0] : p.color);
      const disc = p.discount > 0;
      const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
      const pr = p.hide_price ? 'Consultar' : cur(fp);
      msg += `${i + 1}. *${p.name}*\n   Ref: ${p.code} · Talla: ${sz}${cl ? ` · Color: ${cl}` : ''}\n   Precio: ${pr}\n`;
      msg += `   ${origin}/producto/${encodeURIComponent(p.code)}\n`;
      msg += '\n';
    });
    msg += `Total: ${cart.length} producto(s)\n\n¿Están disponibles? 🛍`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900, background: '#FFF', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', padding: '16px 20px max(16px, env(safe-area-inset-bottom))', maxHeight: '50vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>🛒 Carrito ({cart.length})</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6B7280' }}>×</button>
      </div>
      {cart.map((p, i) => {
        const sz = sizes[p.id] || (p.sizes && p.sizes.length > 0 ? p.sizes[0] : p.size);
        const cl = colors[p.id] || (p.colors && p.colors.length > 0 ? p.colors[0] : p.color);
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < cart.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
            <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#E5E7EB' }}>
              {p.photo_url && <Image src={p.photo_url} alt="" fill sizes="40px" style={{ objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{p.name}</div>
              <div style={{ fontSize: 9, color: '#6B7280' }}>{p.code} · {sz}{cl ? ` · ${cl}` : ''}</div>
            </div>
            {!p.hide_price && <div style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{cur(p.discount > 0 ? Math.round(p.price * (1 - p.discount / 100)) : p.price)}</div>}
            <button onClick={() => onRemove(p.id)} style={{ background: 'none', border: 'none', color: '#C0504E', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        );
      })}
      <button onClick={sendAll} style={{ width: '100%', padding: '13px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", marginTop: 12 }}>
        💬 Enviar todo por WhatsApp ({cart.length})
      </button>
    </div>
  );
}

// ════════════════════════
// MAIN CATALOG
// ════════════════════════
export default function CatalogoPage() {
  const [products, setProducts] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [filter, setFilter] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [sizes, setSizes] = useState({});
  const [colors, setColors] = useState({});
  const [qtys, setQtys] = useState({}); // cantidad seleccionada por producto
  const [reservations, setReservations] = useState([]); // reservas activas de otros clientes
  const [selected, setSelected] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [categories, setCategories] = useState(CATEGORIES_FALLBACK);
  const [checkoutProduct, setCheckoutProduct] = useState(null);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }, { data: cats }] = await Promise.all([
        supabase.from('products').select('*').gt('stock', 0).or('archived.is.null,archived.eq.false').order('created_at', { ascending: false }),
        supabase.from('catalog_config').select('*').eq('id', 1).single(),
        supabase.from('categories').select('name').order('name'),
      ]);
      setProducts(p || []);
      setCfg(c || {});
      if (cats && cats.length > 0) setCategories(cats.map(x => x.name));
      setLoading(false);

      // Si llega ?code=SPL-XX-0000 en la URL, abrir ese producto automáticamente
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code && p) {
          const found = p.find(x => (x.code || '').toLowerCase() === code.toLowerCase());
          if (found) setSelected(found);
        }
      } catch {}
    })();
  }, []);

  // ── Cargar reservas activas (de otros clientes) y refrescar cada 30 segundos ──
  // Esto permite mostrar en tiempo real qué tallas/colores están temporalmente reservados.
  // Función reutilizable para refrescar reservas activas
  async function refreshReservations() {
    try {
      const res = await fetch('/api/stock/reservations', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setReservations(json.reservations || []);
        return json.reservations || [];
      }
    } catch (err) {
      console.warn('No se pudieron cargar reservas:', err);
    }
    return null;
  }

  // Carga inicial + refresh periódico cada 30s
  useEffect(() => {
    refreshReservations();
    const intervalId = setInterval(refreshReservations, 30000);
    return () => clearInterval(intervalId);
  }, []);

  // Cuando se abre el modal de un producto, refrescar reservas inmediatamente
  // para ver el estado más reciente (no esperar al refresh de 30s)
  useEffect(() => {
    if (selected) refreshReservations();
  }, [selected]);

  // Cuando se abre el checkout, refrescar reservas también
  useEffect(() => {
    if (checkoutProduct) refreshReservations();
  }, [checkoutProduct]);

  useEffect(() => {
    if (!selected) return;
    // Si el producto tiene variantes y no hay talla/color seleccionado,
    // pre-seleccionar la primera combinación con stock
    if (hasVariants(selected)) {
      const mode = selected.variants.mode;
      const currentSize = sizes[selected.id];
      const currentColor = colors[selected.id];

      // Si ya hay selección y tiene stock, no tocar
      if (currentSize && currentColor && getVariantStock(selected, currentSize, currentColor) > 0) return;
      if (mode === 'size_only' && currentSize && getVariantStock(selected, currentSize, null) > 0) return;
      if (mode === 'color_only' && currentColor && getVariantStock(selected, null, currentColor) > 0) return;

      // Buscar primera con stock
      const first = selected.variants.items.find(it => (Number(it.stock) || 0) > 0);
      if (!first) return;
      if (mode !== 'color_only' && first.size && !currentSize) {
        setSizes(prev => ({ ...prev, [selected.id]: first.size }));
      }
      if (mode !== 'size_only' && first.color && !currentColor) {
        setColors(prev => ({ ...prev, [selected.id]: first.color }));
      }
    }
  }, [selected]);

  const filtered = products.filter(p => filter === 'Todas' || (p.categories || [p.category]).includes(filter));
  const wa = cfg?.whatsapp_number || '573172346822';
  const ig = cfg?.instagram_url || 'https://www.instagram.com/splendora.col';
  const logo = cfg?.logo_url || '';

  function sendWA(p) {
    const sz = sizes[p.id] || (p.sizes && p.sizes.length > 0 ? p.sizes[0] : p.size);
    const cl = colors[p.id] || (p.colors && p.colors.length > 0 ? p.colors[0] : p.color);
    const disc = p.discount > 0;
    const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
    const pr = p.hide_price ? 'Consultar precio' : (disc ? `${cur(fp)} (antes ${cur(p.price)} - ${p.discount}% OFF)` : cur(p.price));
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/producto/${encodeURIComponent(p.code)}`;
    const msg = `Hola! Me interesa este producto de SPLENDORA.COL:\n\n*${p.name}*\nRef: ${p.code}\n${(p.categories || [p.category]).join(', ')}\nTalla: ${sz}\n${cl ? `Color: ${cl}\n` : ''}Precio: ${pr}\n${p.description || ''}\n\n${link}\n\nEsta disponible?`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function addToCart(p) {
    if (cart.find(x => x.id === p.id)) { alert('Ya está en el carrito'); return; }
    setCart(prev => [...prev, p]); setSelected(null); setShowCart(true);
  }

  async function handlePayMP(p) {
    // Antes de abrir el checkout, refrescar reservas para ver el estado más reciente
    const latestReservations = await refreshReservations();
    const reservationsToCheck = latestReservations !== null ? latestReservations : reservations;

    // Si tiene variantes, asegurar que haya una combinación seleccionada con stock
    if (hasVariants(p)) {
      const mode = p.variants.mode;
      const currentSize = sizes[p.id];
      const currentColor = colors[p.id];

      // Stock real = stock variante - reservas activas
      const variantStock = getVariantStock(p, currentSize, currentColor);
      const reserved = getReservedQty(reservationsToCheck, p.id, currentSize, currentColor, p);
      const realStock = Math.max(0, variantStock - reserved);
      const wantedQty = qtys[p.id] || 1;

      if (realStock < wantedQty) {
        if (variantStock > 0 && realStock === 0) {
          alert('Esta talla/color acaba de ser reservada por otro cliente. Por favor elige otra combinación o vuelve a intentarlo en 10 minutos.');
        } else if (realStock > 0) {
          alert(`Solo quedan ${realStock} unidad${realStock === 1 ? '' : 'es'} disponible${realStock === 1 ? '' : 's'} de esta talla/color. Ajusta la cantidad.`);
        } else {
          // Sin stock real: buscar otra variante con stock real
          const firstAvailable = p.variants.items.find(it => {
            const itStock = (Number(it.stock) || 0);
            if (itStock <= 0) return false;
            const itReserved = getReservedQty(reservationsToCheck, p.id, it.size, it.color, p);
            return (itStock - itReserved) > 0;
          });
          if (!firstAvailable) {
            alert('Este producto está temporalmente agotado.');
            return;
          }
          if (mode !== 'color_only' && firstAvailable.size) {
            setSizes(prev => ({ ...prev, [p.id]: firstAvailable.size }));
          }
          if (mode !== 'size_only' && firstAvailable.color) {
            setColors(prev => ({ ...prev, [p.id]: firstAvailable.color }));
          }
          alert('Esta combinación ya no está disponible. Te seleccionamos otra para que continúes.');
        }
        return;
      }
    } else {
      // Sin variantes: validar producto completo
      const reserved = getReservedQty(reservationsToCheck, p.id, null, null, p);
      const realStock = Math.max(0, (Number(p.stock) || 0) - reserved);
      const wantedQty = qtys[p.id] || 1;
      if (realStock < wantedQty) {
        alert('Este producto ya no está disponible en la cantidad solicitada.');
        return;
      }
    }
    setSelected(null);
    setCheckoutProduct(p);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        {logo && <Image src={logo} alt="" width={50} height={50} style={{ objectFit: 'contain', marginBottom: 8 }} priority />}
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div>
        <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 3, marginTop: 4 }}>Cargando...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: "'Montserrat', sans-serif", color: '#1A1D23', paddingBottom: cart.length > 0 && showCart ? 200 : 0 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ background: '#FFF', padding: '20px 20px 14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {logo && <Image src={logo} alt="SPLENDORA.COL" width={50} height={50} style={{ objectFit: 'contain', marginBottom: 6 }} priority />}
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
          {cfg.banner_image && <div style={{ position: 'relative', width: '100%', height: 180, overflow: 'hidden' }}><Image src={cfg.banner_image} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} priority /></div>}
          {cfg.banner_text && <div style={{ ...(cfg.banner_image ? { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '24px 20px 16px' } : { background: 'linear-gradient(135deg, #1A1D23, #2D3748)', padding: '16px 20px' }), textAlign: 'center' }}><div style={{ color: '#FFF', fontSize: 14, fontWeight: 700 }}>{cfg.banner_text}</div></div>}
        </div>
      )}

      <div style={{ padding: '16px 16px 40px' }}>
        {/* CATEGORIES */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['Todas', ...categories].map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Montserrat', sans-serif",
              background: filter === c ? '#1A1D23' : '#F0F2F5', color: filter === c ? '#FFF' : '#6B7280',
              boxShadow: filter === c ? 'none' : '3px 3px 6px #D1D3D6, -3px -3px 6px #FFFFFF',
            }}>{c}</button>
          ))}
        </div>

        {/* PRODUCTS */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, borderRadius: 16, boxShadow: '5px 5px 10px #D1D3D6, -5px -5px 10px #FFFFFF' }}>
            <div style={{ color: '#9CA3AF' }}>No hay productos disponibles</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 14 }}>
            {filtered.map(p => {
              const disc = p.discount > 0;
              const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
              const photos = [p.photo_url, p.photo_url_2, ...(p.extra_photos || [])].filter(Boolean);
              // Tallas y colores disponibles (considera variantes)
              const sizesAvail = getAvailableSizes(p);
              const colorsAvail = getAvailableColors(p);
              const allSizes = sizesAvail.map(x => x.size);
              const allColors = colorsAvail.map(x => x.color);
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
                    <div style={{ fontSize: 9, color: '#6B7280' }}>{(p.categories || [p.category]).join(' · ')}</div>

                    {/* Show sizes inline */}
                    {allSizes.length > 0 && (
                      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 3 }}>Tallas: {allSizes.join(' · ')}</div>
                    )}

                    {/* Show colors inline */}
                    {allColors.length > 0 && (
                      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>Colores: {allColors.join(' · ')}</div>
                    )}

                    {/* Description preview */}
                    {p.description && (
                      <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                    )}

                    {!p.hide_price ? (
                      <div style={{ marginTop: 6 }}>
                        {disc && <span style={{ fontSize: 10, color: '#9CA3AF', textDecoration: 'line-through', marginRight: 6 }}>{cur(p.price)}</span>}
                        <div style={{ fontSize: 17, fontWeight: 800, color: disc ? '#C0504E' : '#1A1D23' }}>{cur(fp)}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#4A6FA5', fontWeight: 600, marginTop: 6 }}>Consultar precio</div>
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
          boxShadow: '0 4px 16px rgba(37,211,102,0.4)', fontFamily: "'Montserrat', sans-serif",
        }}>🛒 Carrito ({cart.length})</button>
      )}

      {/* PRODUCT MODAL */}
      {selected && (
        <ProductModal
          product={selected}
          onClose={() => setSelected(null)}
          wa={wa}
          selectedSize={sizes[selected.id] || (selected.sizes && selected.sizes.length > 0 ? selected.sizes[0] : selected.size)}
          onSizeChange={(id, s) => setSizes(prev => ({ ...prev, [id]: s }))}
          selectedColor={colors[selected.id] || (selected.colors && selected.colors.length > 0 ? selected.colors[0] : selected.color)}
          onColorChange={(id, c) => setColors(prev => ({ ...prev, [id]: c }))}
          selectedQty={qtys[selected.id] || 1}
          onQtyChange={(id, q) => setQtys(prev => ({ ...prev, [id]: q }))}
          reservations={reservations}
          onWhatsApp={p => { sendWA(p); setSelected(null); }}
          onAddCart={p => addToCart(p)}
          onPayMP={p => handlePayMP(p)}
        />
      )}

      {/* CHECKOUT MERCADO PAGO MODAL */}
      {checkoutProduct && (
        <CheckoutModal
          product={checkoutProduct}
          size={sizes[checkoutProduct.id] || (checkoutProduct.sizes && checkoutProduct.sizes.length > 0 ? checkoutProduct.sizes[0] : checkoutProduct.size)}
          color={colors[checkoutProduct.id] || (checkoutProduct.colors && checkoutProduct.colors.length > 0 ? checkoutProduct.colors[0] : checkoutProduct.color)}
          qty={qtys[checkoutProduct.id] || 1}
          onClose={() => setCheckoutProduct(null)}
        />
      )}

      {/* CART */}
      {showCart && cart.length > 0 && (
        <CartDrawer cart={cart} onClose={() => setShowCart(false)} onRemove={id => setCart(prev => prev.filter(x => x.id !== id))} wa={wa} sizes={sizes} colors={colors} />
      )}

      {/* FOOTER */}
      <div style={{ textAlign: 'center', padding: '24px 20px 32px', background: '#FFF', marginTop: 20 }}>
        {logo && <Image src={logo} alt="" width={40} height={40} style={{ objectFit: 'contain', marginBottom: 8 }} />}
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
