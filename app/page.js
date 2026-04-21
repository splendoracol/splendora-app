'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'finances', label: 'Finanzas' },
  { id: 'catalog', label: 'Catálogo' },
  { id: 'tools', label: 'Más' },
];

const CATEGORIES_DEFAULT = ["Blusas", "Pantalones", "Vestidos", "Faldas", "Conjuntos", "Accesorios", "Zapatos", "Bolsos", "Otro"];
const SIZES_LIST = ["XS", "S", "M", "L", "XL", "XXL", "Única"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const STATUS = {
  pending: { label: 'Pendiente', color: '#D4A843' },
  confirmed: { label: 'Confirmado', color: '#4A6FA5' },
  shipped: { label: 'Enviado', color: '#7B9ECF' },
  delivered: { label: 'Entregado', color: '#4A9E6B' },
  cancelled: { label: 'Cancelado', color: '#C0504E' },
};

const PAYMENT_STATUS = {
  pending: { label: 'Pendiente', color: '#C0504E', bg: '#FEE2E2', icon: '○' },
  partial: { label: 'Abono', color: '#D4A843', bg: '#FEF3C7', icon: '◐' },
  paid: { label: 'Pagado', color: '#4A9E6B', bg: '#D1FAE5', icon: '●' },
};

const cur = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

// Normaliza un nombre de producto para comparación (sin espacios extra, sin mayúsculas)
const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function genCode(cat, idx) {
  const p = { Blusas: 'BL', Pantalones: 'PN', Vestidos: 'VS', Faldas: 'FL', Conjuntos: 'CJ', Accesorios: 'AC', Zapatos: 'ZP', Bolsos: 'BO', Otro: 'OT' };
  return `SPL-${p[cat] || 'SP'}-${String(idx).padStart(4, '0')}`;
}

async function uploadPhoto(file) {
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${file.name.split('.').pop()}`;
  const { error } = await supabase.storage.from('product-photos').upload(name, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return supabase.storage.from('product-photos').getPublicUrl(name).data.publicUrl;
}

function buildExcel(products, orders, expenses, config, month, year) {
  const e = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const n = v => `<Cell><Data ss:Type="Number">${v || 0}</Data></Cell>`;
  const s = v => `<Cell><Data ss:Type="String">${e(v)}</Data></Cell>`;
  const fo = month !== null ? orders.filter(o => { const d = new Date(o.created_at); return d.getMonth() === month && d.getFullYear() === year; }) : orders;
  const fe = month !== null ? expenses.filter(x => { const d = new Date(x.created_at); return d.getMonth() === month && d.getFullYear() === year; }) : expenses;
  const nonCanc = fo.filter(o => o.status !== 'cancelled');
  // Ingresos = ventas totales (accrual)
  const rv = nonCanc.reduce((a, o) => a + (o.total || 0), 0);
  // Costos reales de productos vendidos
  const cs = nonCanc.reduce((a, o) => a + (o.cost_total || 0), 0);
  // Dinero realmente cobrado
  const cashReceived = nonCanc.reduce((a, o) => {
    const ps = o.payment_status || 'pending';
    if (ps === 'paid') return a + (o.total || 0);
    if (ps === 'partial') return a + (o.amount_paid || 0);
    return a;
  }, 0);
  // Por cobrar = ventas − cobrado
  const pc = Math.max(0, rv - cashReceived);
  const ex = fe.reduce((a, x) => a + (x.amount || 0), 0);
  const nt = rv - cs - ex;
  // Distribución: gastos salen primero del 10% de SPLENDORA; si no alcanza, socias cubren déficit 50/50
  const gross = rv - cs;
  const bizBase = gross * 0.10;
  const socBase = gross * 0.45;
  let biz, s1, s2;
  if (ex <= bizBase) { biz = bizBase - ex; s1 = socBase; s2 = socBase; }
  else { const d = (ex - bizBase) / 2; biz = 0; s1 = socBase - d; s2 = socBase - d; }
  const mk = (nm, h, rows) => `<Worksheet ss:Name="${nm}"><Table><Row>${h.map(x => `<Cell ss:StyleID="h"><Data ss:Type="String">${x}</Data></Cell>`).join('')}</Row>${rows}</Table></Worksheet>`;
  const period = month !== null ? `${MONTHS[month]} ${year}` : 'Todo';
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Interior ss:Color="#2D3748" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style></Styles><Worksheet ss:Name="Resumen"><Table><Row><Cell ss:StyleID="h"><Data ss:Type="String">Concepto</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Valor</Data></Cell></Row><Row>${s('Periodo')}${s(period)}</Row><Row>${s('Ingresos (ventas)')}${n(rv)}</Row><Row>${s('Cobrado')}${n(cashReceived)}</Row><Row>${s('Por cobrar')}${n(pc)}</Row><Row>${s('Costos (productos vendidos)')}${n(cs)}</Row><Row>${s('Gastos')}${n(ex)}</Row><Row>${s('Ganancia neta')}${n(nt)}</Row><Row>${s('SPLENDORA (10%)')}${n(biz)}</Row><Row>${s(config.partner1 + ' (45%)')}${n(s1)}</Row><Row>${s(config.partner2 + ' (45%)')}${n(s2)}</Row></Table></Worksheet>${mk('Inventario', ['Código', 'Nombre', 'Categoría', 'Tallas', 'Color', 'Costo u.', 'Precio u.', 'Stock', 'Inversión (costo×stock)', 'Valor venta (precio×stock)', 'Ganancia proy. (×stock)', 'Descuento %'], products.map(p => { const inv = (p.cost_total || 0) * (p.stock || 0); const val = (p.price || 0) * (p.stock || 0); const gp = ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0); return `<Row>${s(p.code)}${s(p.name)}${s((p.categories || [p.category]).join(', '))}${s((p.sizes || []).join(', ') || p.size)}${s((p.colors || [p.color]).filter(Boolean).join(', '))}${n(p.cost_total)}${n(p.price)}${n(p.stock)}${n(inv)}${n(val)}${n(gp)}${n(p.discount)}</Row>`; }).join(''))}${mk('Pedidos', ['Fecha', 'Cliente', 'Ciudad', 'Canal', 'Productos', 'Total', 'Costo', 'Estado entrega', 'Estado pago', 'Abonado', 'Por cobrar', 'Notas pago'], fo.map(o => { const due = Math.max(0, (o.total || 0) - (o.amount_paid || 0)); const ps = o.payment_status || 'pending'; return `<Row>${s(new Date(o.created_at).toLocaleDateString('es-CO'))}${s(o.customer_name)}${s(o.city || '')}${s(o.channel)}${s((o.items || []).map(i => `${i.name} x${i.qty}${i.size ? ` (T:${i.size})` : ''}${i.color ? ` (${i.color})` : ''}`).join(', '))}${n(o.total)}${n(o.cost_total)}${s(STATUS[o.status]?.label || o.status)}${s(PAYMENT_STATUS[ps]?.label || ps)}${n(o.amount_paid)}${n(ps === 'paid' ? 0 : due)}${s(o.payment_notes || '')}</Row>`; }).join(''))}${mk('Gastos', ['Fecha', 'Descripción', 'Monto', 'Pagado por'], fe.map(x => `<Row>${s(new Date(x.created_at).toLocaleDateString('es-CO'))}${s(x.description)}${n(x.amount)}${s(x.paid_by)}</Row>`).join(''))}</Workbook>`;
}

function dlExcel(p, o, e, c, month, year) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildExcel(p, o, e, c, month, year)], { type: 'application/vnd.ms-excel' }));
  a.download = `SPLENDORA_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
}

// ── UI Components ──
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${wide ? 'modal-wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#F0F2F5', zIndex: 1, borderRadius: '20px 20px 0 0' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button className="neu-btn neu-btn-sm" onClick={onClose} style={{ width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ padding: '0 22px 22px' }}>{children}</div>
      </div>
    </div>
  );
}

function Fld({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Thumb({ src, size = 46 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--pressed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: size * 0.35, color: '#9CA3AF' }}>+</span>}
    </div>
  );
}

// ── MONTH SELECTOR ──
function MonthFilter({ month, year, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
      <button
        className="neu-btn neu-btn-sm"
        onClick={() => onChange(null, year)}
        style={{
          whiteSpace: 'nowrap',
          fontSize: 10,
          boxShadow: month === null ? 'var(--pressed)' : undefined,
          color: month === null ? '#4A6FA5' : undefined,
          fontWeight: month === null ? 800 : undefined,
        }}
      >
        Todo
      </button>
      {MONTHS.map((m, i) => (
        <button
          key={i}
          className="neu-btn neu-btn-sm"
          onClick={() => onChange(i, year)}
          style={{
            whiteSpace: 'nowrap',
            fontSize: 10,
            boxShadow: month === i ? 'var(--pressed)' : undefined,
            color: month === i ? '#4A6FA5' : undefined,
            fontWeight: month === i ? 800 : undefined,
          }}
        >
          {m.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}

// ── SALES CHART ──
// Muestra ventas totales por mes (accrual: cuenta al venderse, no al cobrarse)
function SalesChart({ orders }) {
  const year = new Date().getFullYear();
  const monthlyData = useMemo(() => {
    const data = MONTHS.map((name, i) => {
      const monthOrders = orders.filter(o => {
        const d = new Date(o.created_at);
        return d.getMonth() === i && d.getFullYear() === year && o.status !== 'cancelled';
      });
      const revenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0);
      const cost = monthOrders.reduce((s, o) => s + (o.cost_total || 0), 0);
      const count = monthOrders.length;
      return { name: name.slice(0, 3), revenue, cost, profit: revenue - cost, count, month: i };
    });
    return data;
  }, [orders, year]);

  const maxVal = Math.max(...monthlyData.map(d => d.revenue), 1);
  const currentMonth = new Date().getMonth();

  return (
    <>
      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, marginBottom: 8 }}>
        {monthlyData.map((d, i) => {
          const h = maxVal > 0 ? (d.revenue / maxVal) * 120 : 0;
          const isCurrent = i === currentMonth;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              {d.revenue > 0 && (
                <div style={{ fontSize: 7, color: '#6B7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {(d.revenue / 1000).toFixed(0)}k
                </div>
              )}
              <div style={{
                width: '100%', maxWidth: 24, height: Math.max(h, 3), borderRadius: '6px 6px 2px 2px',
                background: isCurrent
                  ? 'linear-gradient(180deg, #4A6FA5, #3A5A8A)'
                  : d.revenue > 0 ? 'linear-gradient(180deg, #7B9ECF, #A8C4E0)' : '#E5E7EB',
                boxShadow: d.revenue > 0 ? '2px 2px 4px #D1D3D6' : 'none',
                transition: 'height 0.3s ease',
              }} />
              <div style={{
                fontSize: 7, fontWeight: isCurrent ? 800 : 500,
                color: isCurrent ? '#4A6FA5' : '#9CA3AF',
              }}>
                {d.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[
          { l: 'Mejor mes', v: (() => { const best = [...monthlyData].sort((a, b) => b.revenue - a.revenue)[0]; return best.revenue > 0 ? `${best.name} (${cur(best.revenue)})` : '—'; })(), c: '#4A9E6B' },
          { l: 'Total año', v: cur(monthlyData.reduce((s, d) => s + d.revenue, 0)), c: '#4A6FA5' },
          { l: 'Pedidos año', v: monthlyData.reduce((s, d) => s + d.count, 0), c: '#1A1D23' },
        ].map((x, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', padding: 8, borderRadius: 8, background: '#F0F2F5', boxShadow: 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
            <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{x.l}</div>
            <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2, color: x.c }}>{x.v}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ════════════════════════
// MAIN APP
// ════════════════════════
export default function HomePage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [config, setConfig] = useState({ partner1: 'DahiannaGs', partner2: 'Estelasuarez', split: 50, business_split: 10 });
  const [catCfg, setCatCfg] = useState({ banner_text: '', banner_image: '', banner_active: false, instagram_url: '', whatsapp_number: '', logo_url: '' });
  const [showProd, setShowProd] = useState(false);
  const [editProd, setEditProd] = useState(null);
  const [showOrd, setShowOrd] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [showCatCfg, setShowCatCfg] = useState(false);
  const [catFilter, setCatFilter] = useState('Todas');
  const [search, setSearch] = useState('');
  const [fMonth, setFMonth] = useState(null);
  const [fYear, setFYear] = useState(new Date().getFullYear());
  const [categories, setCategories] = useState(CATEGORIES_DEFAULT);
  const [newCat, setNewCat] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  // Estados de colapsables del dashboard (se guardan en localStorage)
  const [dashSocias, setDashSocias] = useState(true);
  const [dashProyeccion, setDashProyeccion] = useState(true);
  const [dashStock, setDashStock] = useState(true);
  // Colapsables de finanzas
  const [finChart, setFinChart] = useState(true);
  const [finGastos, setFinGastos] = useState(true);

  useEffect(() => {
    try {
      const s = localStorage.getItem('dash_socias');
      const p = localStorage.getItem('dash_proyeccion');
      const st = localStorage.getItem('dash_stock');
      const fc = localStorage.getItem('fin_chart');
      const fg = localStorage.getItem('fin_gastos');
      if (s !== null) setDashSocias(s === '1');
      if (p !== null) setDashProyeccion(p === '1');
      if (st !== null) setDashStock(st === '1');
      if (fc !== null) setFinChart(fc === '1');
      if (fg !== null) setFinGastos(fg === '1');
    } catch {}
  }, []);

  const toggleDash = (setter, current, key) => {
    const next = !current;
    setter(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch {}
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) window.location.href = '/login';
      else loadAll();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) window.location.href = '/login';
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadAll() {
    const [{ data: p }, { data: o }, { data: e }, { data: c }, { data: cc }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('config').select('*').eq('id', 1).single(),
      supabase.from('catalog_config').select('*').eq('id', 1).single(),
      supabase.from('categories').select('name').order('name'),
    ]);
    setProducts(p || []); setOrders(o || []); setExpenses(e || []);
    if (c) setConfig(c);
    if (cc) setCatCfg(cc);
    if (cats && cats.length > 0) setCategories(cats.map(x => x.name));
    setLoading(false);
  }

  // Category CRUD
  async function addCategory(name) {
    if (!name.trim() || categories.includes(name.trim())) return;
    await supabase.from('categories').insert({ name: name.trim() });
    setNewCat('');
    loadAll();
  }
  async function deleteCategory(name) {
    if (!confirm(`¿Eliminar la categoría "${name}"? Los productos que la tengan NO se borran.`)) return;
    await supabase.from('categories').delete().eq('name', name);
    loadAll();
  }

  // CRUD
  async function saveProduct(prod, editId) {
    // Clean prod to only include Supabase columns
    const clean = {
      name: (prod.name || '').trim(),
      category: prod.category || (prod.categories && prod.categories[0]) || 'Otro',
      categories: prod.categories || prod.productCategories || [prod.category || 'Otro'],
      size: prod.size || 'M',
      sizes: prod.sizes || [],
      color: prod.color || (prod.colors && prod.colors[0]) || '',
      colors: prod.colors || (prod.color ? [prod.color] : []),
      cost_product: prod.cost_product || 0,
      cost_bag: prod.cost_bag || 0,
      cost_shipping: prod.cost_shipping || 0,
      cost_total: prod.cost_total || 0,
      price: prod.price || 0,
      stock: prod.stock || 0,
      description: prod.description || '',
      photo_url: prod.photo_url || '',
      photo_url_2: prod.photo_url_2 || '',
      extra_photos: prod.extra_photos || [],
      discount: prod.discount || 0,
      hide_price: prod.hide_price || false,
    };
    try {
      if (editId) {
        const { error } = await supabase.from('products').update(clean).eq('id', editId);
        if (error) throw error;
      } else {
        const { data: cnt } = await supabase.from('counters').select('value').eq('id', 'product_code').single();
        const code = genCode(clean.categories[0] || clean.category, cnt?.value || 1);
        const { error } = await supabase.from('products').insert({ ...clean, code });
        if (error) throw error;
        await supabase.from('counters').update({ value: (cnt?.value || 1) + 1 }).eq('id', 'product_code');
      }
      await loadAll();
      return { ok: true };
    } catch (err) {
      // 23505 = unique violation en Postgres
      const isDup = err?.code === '23505' || /duplicate|unique/i.test(err?.message || '');
      return { ok: false, error: isDup ? `Ya existe un producto con el nombre "${clean.name}"` : (err?.message || 'Error al guardar') };
    }
  }
  async function deleteProduct(id) { await supabase.from('products').delete().eq('id', id); loadAll(); }
  async function saveOrder(ord) {
    // Insertar pedido
    const { error: insErr } = await supabase.from('orders').insert(ord);
    if (insErr) { alert('Error al crear pedido: ' + insErr.message); return; }
    // Descontar stock inmediatamente (el producto queda reservado para esta clienta)
    for (const it of (ord.items || [])) {
      const p = products.find(x => x.id === it.productId);
      if (p) await supabase.from('products').update({ stock: Math.max(0, (p.stock || 0) - (it.qty || 0)) }).eq('id', p.id);
    }
    loadAll();
  }
  async function updateOrderStatus(id, status, items, prev) {
    await supabase.from('orders').update({ status }).eq('id', id);
    // Cancelar pedido activo → devolver stock al inventario
    if (status === 'cancelled' && prev !== 'cancelled') {
      for (const it of (items || [])) {
        const p = products.find(x => x.id === it.productId);
        if (p) await supabase.from('products').update({ stock: (p.stock || 0) + (it.qty || 0) }).eq('id', p.id);
      }
    }
    // Reactivar pedido cancelado → volver a descontar del stock
    if (prev === 'cancelled' && status !== 'cancelled') {
      for (const it of (items || [])) {
        const p = products.find(x => x.id === it.productId);
        if (p) await supabase.from('products').update({ stock: Math.max(0, (p.stock || 0) - (it.qty || 0)) }).eq('id', p.id);
      }
    }
    loadAll();
  }
  async function updatePayment(id, payment_status, amount_paid, payment_notes) {
    const patch = { payment_status };
    if (amount_paid !== undefined) patch.amount_paid = amount_paid;
    if (payment_notes !== undefined) patch.payment_notes = payment_notes;
    await supabase.from('orders').update(patch).eq('id', id);
    loadAll();
  }
  async function deleteOrder(id, items, prevStatus) {
    // Si el pedido NO estaba cancelado, el stock estaba descontado → devolverlo al inventario
    if (prevStatus !== 'cancelled') {
      for (const it of (items || [])) {
        const p = products.find(x => x.id === it.productId);
        if (p) await supabase.from('products').update({ stock: (p.stock || 0) + (it.qty || 0) }).eq('id', p.id);
      }
    }
    await supabase.from('orders').delete().eq('id', id);
    loadAll();
  }
  async function saveExpense(exp) { await supabase.from('expenses').insert(exp); loadAll(); }
  async function deleteExpense(id) { await supabase.from('expenses').delete().eq('id', id); loadAll(); }
  async function saveConfig(cfg) { await supabase.from('config').update(cfg).eq('id', 1); setConfig(cfg); setShowCfg(false); }
  async function saveCatCfg(cc) { await supabase.from('catalog_config').update(cc).eq('id', 1); setCatCfg(cc); setShowCatCfg(false); }

  // Monthly filters
  const filteredOrders = useMemo(() => {
    if (fMonth === null) return orders;
    return orders.filter(o => {
      const d = new Date(o.created_at);
      return d.getMonth() === fMonth && d.getFullYear() === fYear;
    });
  }, [orders, fMonth, fYear]);

  const filteredExpenses = useMemo(() => {
    if (fMonth === null) return expenses;
    return expenses.filter(x => {
      const d = new Date(x.created_at);
      return d.getMonth() === fMonth && d.getFullYear() === fYear;
    });
  }, [expenses, fMonth, fYear]);

  // Metrics
  const m = useMemo(() => {
    // Inversión actual en inventario = Σ(costo_unitario × stock)
    const ic = products.reduce((s, p) => s + (p.cost_total || 0) * (p.stock || 0), 0);
    // Valor del inventario al precio de venta = Σ(precio × stock)
    const ir = products.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0);

    // Pedidos no cancelados del periodo
    const nonCanc = filteredOrders.filter(o => o.status !== 'cancelled');
    const dn = nonCanc.filter(o => o.status === 'delivered');

    // ── CONTABILIDAD ACCRUAL (estándar para negocios) ──
    // Ingresos = total facturado del periodo (las ventas cuentan al venderse, no al cobrarse)
    const rv = nonCanc.reduce((s, o) => s + (o.total || 0), 0);
    // Costos = costo real de los productos que salieron del inventario
    const cs = nonCanc.reduce((s, o) => s + (o.cost_total || 0), 0);
    // Dinero realmente cobrado (informativo: lo que hay en caja de esas ventas)
    const cashReceived = nonCanc.reduce((s, o) => {
      const ps = o.payment_status || 'pending';
      if (ps === 'paid') return s + (o.total || 0);
      if (ps === 'partial') return s + (o.amount_paid || 0);
      return s;
    }, 0);
    // Por cobrar = ventas − cobrado
    const pc = Math.max(0, rv - cashReceived);
    const ex = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const nt = rv - cs - ex;

    // ── DISTRIBUCIÓN ──
    // Regla: los gastos salen primero del 10% de SPLENDORA.
    // Si el 10% no alcanza, las socias cubren el déficit 50/50.
    const gross = rv - cs; // ganancia bruta antes de gastos
    const bizBase = gross * 0.10;
    const socBase = gross * 0.45;
    let biz, s1, s2, deficitCoveredBySocia = 0, expensesAbsorbedByBiz = 0;
    if (ex <= bizBase) {
      // SPLENDORA absorbe todos los gastos
      biz = bizBase - ex;
      s1 = socBase;
      s2 = socBase;
      expensesAbsorbedByBiz = ex;
    } else {
      // El 10% no alcanzó → socias cubren el déficit 50/50
      biz = 0;
      const deficit = ex - bizBase;
      deficitCoveredBySocia = deficit / 2;
      s1 = socBase - deficitCoveredBySocia;
      s2 = socBase - deficitCoveredBySocia;
      expensesAbsorbedByBiz = bizBase;
    }

    const paidOrders = nonCanc.filter(o => (o.payment_status || 'pending') === 'paid').length;
    const partialOrders = nonCanc.filter(o => (o.payment_status || 'pending') === 'partial').length;
    const pendingPayOrders = nonCanc.filter(o => (o.payment_status || 'pending') === 'pending').length;

    // Ganancia proyectada si se vende TODO el inventario actual
    // = Σ((precio - costo) × stock)
    const projProfit = products.reduce((s, p) => s + ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0), 0);
    const projBiz = projProfit * 0.10;
    const projDist = projProfit - projBiz;
    const projS1 = projDist * 0.5;
    const projS2 = projDist * 0.5;

    return {
      ic, ir, dn, rv, cs, ex, nt, biz, s1, s2, pc, gross, cashReceived,
      deficitCoveredBySocia, expensesAbsorbedByBiz,
      paidOrders, partialOrders, pendingPayOrders,
      projProfit, projBiz, projS1, projS2,
      // Unidades totales vendidas en el periodo (suma de qty en items de pedidos no cancelados)
      totalProductsSold: nonCanc.reduce((s, o) => s + (o.items || []).reduce((a, i) => a + (i.qty || 0), 0), 0),
      totalUnits: products.reduce((s, p) => s + (p.stock || 0), 0),
      low: products.filter(p => p.stock > 0 && p.stock <= 2),
      out: products.filter(p => p.stock === 0),
      pnd: filteredOrders.filter(o => o.status === 'pending' || o.status === 'confirmed'),
    };
  }, [products, filteredOrders, filteredExpenses]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5', fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 3, marginTop: 4 }}>CARGANDO...</div>
        </div>
      </div>
    );
  }

  const logo = catCfg.logo_url || '';

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: "'Montserrat', sans-serif", color: '#1A1D23', paddingBottom: 78 }}>
      {/* HEADER WITH LOGO */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {logo && <img src={logo} alt="Logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div>
            <div style={{ fontSize: 8, color: '#9CA3AF', letterSpacing: 3, marginTop: -1 }}>C O L</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="neu-btn neu-btn-sm" onClick={() => setShowCfg(true)}>⚙</button>
          <button className="neu-btn neu-btn-sm" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}>Salir</button>
        </div>
      </div>

      <div style={{ padding: '0 14px' }}>

        {/* ═══ DASHBOARD ═══ */}
        {tab === 'dashboard' && (
          <div>
            <MonthFilter month={fMonth} year={fYear} onChange={(mm, y) => { setFMonth(mm); setFYear(y); }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { l: 'Productos', v: products.length, s: `${m.totalUnits} unidades · ${m.out.length} agotados` },
                { l: 'Pedidos pend.', v: m.pnd.length, s: `${m.dn.length} entregados`, c: '#4A6FA5' },
                { l: 'Inversión inventario', v: cur(m.ic), s: `${m.totalUnits} und · Valor venta: ${cur(m.ir)}`, c: '#4A6FA5' },
                { l: 'Por cobrar', v: cur(m.pc), s: `${m.partialOrders} abono · ${m.pendingPayOrders} pend.`, c: m.pc > 0 ? '#D4A843' : '#9CA3AF' },
                { l: 'Ingresos (ventas)', v: cur(m.rv), s: `Cobrado: ${cur(m.cashReceived)}`, c: '#4A9E6B' },
                { l: 'Ganancia neta', v: cur(m.nt), s: `SPLENDORA: ${cur(m.biz)}`, c: m.nt >= 0 ? '#4A9E6B' : '#C0504E' },
              ].map((x, i) => (
                <div key={i} className="neu-card" style={{ padding: 14 }}>
                  <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 7 }}>{x.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: x.c || '#1A1D23' }}>{x.v}</div>
                  <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>{x.s}</div>
                </div>
              ))}
            </div>

            {/* Division 10/45/45 */}
            <div className="neu-card" style={{ marginTop: 14 }}>
              <div onClick={() => toggleDash(setDashSocias, dashSocias, 'dash_socias')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dashSocias ? 12 : 0, userSelect: 'none' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5 }}>División (10% / 45% / 45%)</div>
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{dashSocias ? '▾' : '▸'}</span>
              </div>
              {dashSocias && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { n: 'SPLENDORA', p: '10%', v: m.biz, c: '#4A6FA5' },
                    { n: config.partner1, p: '45%', v: m.s1, c: '#1A1D23' },
                    { n: config.partner2, p: '45%', v: m.s2, c: '#1A1D23' },
                  ].map((x, i) => (
                    <div key={i} className="neu-card neu-pressed" style={{ flex: 1, textAlign: 'center', padding: 10 }}>
                      <div style={{ fontSize: 8, color: '#6B7280' }}>{x.n} ({x.p})</div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: x.c }}>{cur(x.v)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projected profit */}
            <div className="neu-card" style={{ marginTop: 14 }}>
              <div onClick={() => toggleDash(setDashProyeccion, dashProyeccion, 'dash_proyeccion')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dashProyeccion ? 12 : 0, userSelect: 'none' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5 }}>📊 Si vendes todo el inventario</div>
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{dashProyeccion ? '▾' : '▸'}</span>
              </div>
              {dashProyeccion && (
                <>
                  <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 8, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>Ganancia total proyectada</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: m.projProfit >= 0 ? '#4A9E6B' : '#C0504E' }}>{cur(m.projProfit)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { n: 'SPLENDORA', p: '10%', v: m.projBiz, c: '#4A6FA5' },
                      { n: config.partner1, p: '45%', v: m.projS1, c: '#1A1D23' },
                      { n: config.partner2, p: '45%', v: m.projS2, c: '#1A1D23' },
                    ].map((x, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', padding: 8, borderRadius: 10, background: '#F0F2F5' }}>
                        <div style={{ fontSize: 7, color: '#6B7280' }}>{x.n}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2, color: x.c }}>{cur(x.v)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 8, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>Basado en {products.reduce((s, p) => s + (p.stock || 0), 0)} unidades en inventario</div>
                </>
              )}
            </div>

            {/* Alerts */}
            {(m.low.length > 0 || m.out.length > 0) && (
              <div className="neu-card" style={{ marginTop: 14, padding: 14 }}>
                <div onClick={() => toggleDash(setDashStock, dashStock, 'dash_stock')}
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dashStock ? 8 : 0, userSelect: 'none' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#D4A843', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                    ⚠ Stock bajo ({m.out.length + m.low.length})
                  </div>
                  <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{dashStock ? '▾' : '▸'}</span>
                </div>
                {dashStock && (
                  <>
                    {m.out.map(p => <div key={p.id} style={{ fontSize: 11, color: '#C0504E', marginBottom: 3 }}><b>{p.code}</b> {p.name} — Agotado</div>)}
                    {m.low.map(p => <div key={p.id} style={{ fontSize: 11, color: '#D4A843', marginBottom: 3 }}><b>{p.code}</b> {p.name} — {p.stock}</div>)}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="neu-btn neu-btn-accent" style={{ flex: 1 }} onClick={() => { setEditProd(null); setShowProd(true); }}>+ Producto</button>
              <button className="neu-btn" style={{ flex: 1 }} onClick={() => setShowOrd(true)}>+ Pedido</button>
            </div>
          </div>
        )}

        {/* ═══ INVENTORY ═══ */}
        {tab === 'inventory' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Inventario</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="neu-btn neu-btn-sm" onClick={() => setShowBulk(true)}>📦 Masivo</button>
                <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={() => { setEditProd(null); setShowProd(true); }}>+ Nuevo</button>
              </div>
            </div>

            {/* Totales de inventario */}
            <div className="neu-card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Totales del inventario</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <div className="neu-card neu-pressed" style={{ padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Unidades</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{m.totalUnits}</div>
                </div>
                <div className="neu-card neu-pressed" style={{ padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inversión</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2, color: '#4A6FA5' }}>{cur(m.ic)}</div>
                </div>
                <div className="neu-card neu-pressed" style={{ padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Valor venta</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2, color: '#4A9E6B' }}>{cur(m.ir)}</div>
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>Ganancia potencial: <b style={{ color: '#4A9E6B' }}>{cur(m.projProfit)}</b> si se vende todo</div>
            </div>

            <div className="neu-card neu-pressed" style={{ padding: 0, marginBottom: 12 }}>
              <input className="neu-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ boxShadow: 'none', background: 'transparent' }} />
            </div>
            {products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase())).map(p => {
              const inv = (p.cost_total || 0) * (p.stock || 0);
              const val = (p.price || 0) * (p.stock || 0);
              return (
              <div key={p.id} className="neu-card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <Thumb src={p.photo_url} size={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#4A6FA5', boxShadow: 'var(--pressed)', padding: '2px 7px', borderRadius: 6 }}>{p.code}</span>
                    {p.discount > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#C0504E', background: '#FEE2E2', padding: '1px 5px', borderRadius: 4 }}>-{p.discount}%</span>}
                    {p.hide_price && <span style={{ fontSize: 8, fontWeight: 700, color: '#6B7280', background: '#E5E7EB', padding: '1px 5px', borderRadius: 4 }}>$ oculto</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: '#6B7280' }}>
                    {(p.categories || [p.category]).join(', ')} · {(p.sizes || []).join(', ') || p.size}{(p.colors && p.colors.length > 0) ? ` · ${p.colors.join(', ')}` : p.color ? ` · ${p.color}` : ''} · {cur(p.price)}
                  </div>
                  <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3 }}>
                    Inv: <b style={{ color: '#4A6FA5' }}>{cur(inv)}</b> · Venta: <b style={{ color: '#4A9E6B' }}>{cur(val)}</b>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <div className="neu-card neu-pressed" style={{ padding: '3px 10px', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: p.stock === 0 ? '#C0504E' : p.stock <= 2 ? '#D4A843' : '#4A9E6B' }}>{p.stock}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="neu-btn neu-btn-sm" onClick={() => { setEditProd(p); setShowProd(true); }} style={{ padding: '3px 7px' }}>✎</button>
                    <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => { if (confirm('¿Eliminar?')) deleteProduct(p.id); }} style={{ padding: '3px 7px' }}>✕</button>
                  </div>
                </div>
              </div>
            );})}
          </div>
        )}

        {/* ═══ ORDERS ═══ */}
        {tab === 'orders' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Pedidos</h2>
              <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={() => setShowOrd(true)}>+ Nuevo</button>
            </div>
            <MonthFilter month={fMonth} year={fYear} onChange={(mm, y) => { setFMonth(mm); setFYear(y); }} />

            {/* Resumen de pagos del periodo */}
            <div className="neu-card" style={{ padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                <div style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: '#D1FAE5' }}>
                  <div style={{ fontSize: 7, color: '#4A9E6B', fontWeight: 700, textTransform: 'uppercase' }}>Cobrado</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#4A9E6B', marginTop: 2 }}>{cur(m.rv)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: '#FEF3C7' }}>
                  <div style={{ fontSize: 7, color: '#D4A843', fontWeight: 700, textTransform: 'uppercase' }}>Por cobrar</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#D4A843', marginTop: 2 }}>{cur(m.pc)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: '#F0F2F5', boxShadow: 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Pedidos</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>{filteredOrders.length}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 6, borderRadius: 8, background: '#F0F2F5', boxShadow: 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Productos</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>{m.totalProductsSold}</div>
                </div>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="neu-card" style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Sin pedidos en este periodo</div>
            ) : filteredOrders.map(o => {
              const ps = o.payment_status || 'pending';
              const psCfg = PAYMENT_STATUS[ps];
              const due = Math.max(0, (o.total || 0) - (o.amount_paid || 0));
              // Obtener foto principal de cada producto del pedido
              const itemThumbs = (o.items || []).map(it => {
                const prod = products.find(p => p.id === it.productId);
                return { qty: it.qty, name: it.name, photo: prod?.photo_url };
              });
              return (
              <div key={o.id} className="neu-card" style={{ padding: 14, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.customer_name}{o.city ? <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 500 }}> · 📍 {o.city}</span> : null}</div>
                    {/* Miniaturas de productos */}
                    {itemThumbs.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {itemThumbs.map((t, idx) => (
                          <div key={idx} title={`${t.name} ×${t.qty}`} style={{ position: 'relative', width: 36, height: 36, borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--raised-sm)', flexShrink: 0, background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {t.photo
                              ? <img src={t.photo} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 14, color: '#9CA3AF' }}>📦</span>
                            }
                            {t.qty > 1 && <span style={{ position: 'absolute', bottom: 0, right: 0, background: '#1A1D23', color: '#FFF', fontSize: 8, fontWeight: 800, padding: '1px 4px', borderTopLeftRadius: 6 }}>×{t.qty}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>{(o.items || []).map(i => `${i.name} ×${i.qty}${i.size ? ` (T:${i.size})` : ''}${i.color ? ` (${i.color})` : ''}`).join(', ')}</div>
                    <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>{o.channel} · {new Date(o.created_at).toLocaleDateString('es-CO')}</div>
                    {o.payment_notes && <div style={{ fontSize: 9, color: '#6B7280', marginTop: 3, fontStyle: 'italic' }}>📝 {o.payment_notes}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{cur(o.total)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3, alignItems: 'flex-end' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, color: STATUS[o.status]?.color, boxShadow: 'var(--pressed)' }}>{STATUS[o.status]?.label}</span>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, color: psCfg.color, background: psCfg.bg }}>
                        {psCfg.icon} {psCfg.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Línea de pago */}
                {ps !== 'paid' && o.status !== 'cancelled' && (
                  <div className="neu-card neu-pressed" style={{ padding: 8, marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span>Abonado: <b style={{ color: '#4A9E6B' }}>{cur(o.amount_paid || 0)}</b></span>
                    <span>Por cobrar: <b style={{ color: '#C0504E' }}>{cur(due)}</b></span>
                  </div>
                )}

                {/* Botones de estado de entrega */}
                <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS).filter(([k]) => k !== 'cancelled').map(([k, v]) => (
                    <button key={k} className="neu-btn neu-btn-sm" onClick={() => updateOrderStatus(o.id, k, o.items, o.status)}
                      style={{ padding: '3px 7px', fontSize: 9, ...(o.status === k ? { boxShadow: 'var(--pressed)', color: v.color, fontWeight: 800 } : {}) }}>
                      {v.label}
                    </button>
                  ))}
                  <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => { if (confirm('¿Cancelar este pedido?\n\nEl stock de los productos volverá al inventario.')) updateOrderStatus(o.id, 'cancelled', o.items, o.status); }}
                    style={{ padding: '3px 7px', fontSize: 9, marginLeft: 'auto' }}>Cancelar</button>
                </div>

                {/* Botones de estado de pago */}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, marginRight: 4 }}>PAGO:</span>
                  <button className="neu-btn neu-btn-sm" onClick={() => updatePayment(o.id, 'pending', 0)}
                    style={{ padding: '3px 8px', fontSize: 9, ...(ps === 'pending' ? { boxShadow: 'var(--pressed)', color: PAYMENT_STATUS.pending.color, fontWeight: 800 } : {}) }}>
                    ○ Pendiente
                  </button>
                  <button className="neu-btn neu-btn-sm" onClick={() => {
                    const current = o.amount_paid || 0;
                    const s = prompt(`Abono TOTAL acumulado de la clienta\n(Total del pedido: ${cur(o.total)})\n${current > 0 ? `Ya tenía abonado: ${cur(current)}` : ''}`, String(current));
                    if (s === null) return;
                    const n = Number(s);
                    if (isNaN(n) || n < 0) { alert('Monto inválido'); return; }
                    if (n >= (o.total || 0)) { updatePayment(o.id, 'paid', o.total); return; }
                    updatePayment(o.id, 'partial', n);
                  }}
                    style={{ padding: '3px 8px', fontSize: 9, ...(ps === 'partial' ? { boxShadow: 'var(--pressed)', color: PAYMENT_STATUS.partial.color, fontWeight: 800 } : {}) }}>
                    ◐ Abono
                  </button>
                  <button className="neu-btn neu-btn-sm" onClick={() => updatePayment(o.id, 'paid', o.total)}
                    style={{ padding: '3px 8px', fontSize: 9, ...(ps === 'paid' ? { boxShadow: 'var(--pressed)', color: PAYMENT_STATUS.paid.color, fontWeight: 800 } : {}) }}>
                    ● Pagado
                  </button>
                  <button className="neu-btn neu-btn-sm" title="Borrar pedido permanentemente"
                    onClick={() => {
                      const msg = o.status !== 'cancelled'
                        ? `¿Borrar este pedido PERMANENTEMENTE?\n\nCliente: ${o.customer_name}\nTotal: ${cur(o.total)}\n\nLas unidades volverán al inventario.\nEsta acción NO se puede deshacer.`
                        : `¿Borrar este pedido cancelado PERMANENTEMENTE?\n\nCliente: ${o.customer_name}\nTotal: ${cur(o.total)}\n\nEsta acción NO se puede deshacer.`;
                      if (confirm(msg)) deleteOrder(o.id, o.items, o.status);
                    }}
                    style={{ padding: '3px 8px', fontSize: 10, marginLeft: 'auto', color: '#C0504E' }}>
                    🗑
                  </button>
                </div>
              </div>
            );})}
          </div>
        )}

        {/* ═══ FINANCES ═══ */}
        {tab === 'finances' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Finanzas</h2>
              <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={() => setShowExp(true)}>+ Gasto</button>
            </div>
            <MonthFilter month={fMonth} year={fYear} onChange={(mm, y) => { setFMonth(mm); setFYear(y); }} />
            <div className="neu-card" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { l: 'Ingresos (ventas)', v: m.rv, c: '#4A9E6B' },
                  { l: 'Costos productos', v: m.cs },
                  { l: 'Gastos', v: m.ex, c: '#D4A843' },
                  { l: 'Ganancia neta', v: m.nt, c: m.nt >= 0 ? '#4A9E6B' : '#C0504E' },
                ].map((r, i) => (
                  <div key={i} className="neu-card neu-pressed" style={{ padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>{r.l}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: r.c || '#1A1D23' }}>{cur(r.v)}</div>
                  </div>
                ))}
              </div>

              {/* Estado de caja: cobrado vs por cobrar */}
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: 10, borderRadius: 10, background: '#D1FAE5', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#4A9E6B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>💰 Cobrado (en caja)</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, color: '#4A9E6B' }}>{cur(m.cashReceived)}</div>
                  <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>{m.paidOrders} pagados · {m.partialOrders} abono</div>
                </div>
                <div style={{ padding: 10, borderRadius: 10, background: m.pc > 0 ? '#FEF3C7' : '#F0F2F5', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: m.pc > 0 ? '#D4A843' : '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>⏳ Por cobrar</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, color: m.pc > 0 ? '#D4A843' : '#9CA3AF' }}>{cur(m.pc)}</div>
                  <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>{m.partialOrders} con abono · {m.pendingPayOrders} sin pagar</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {[
                  { n: 'SPLENDORA', p: '10%', v: m.biz, c: '#4A6FA5', sub: m.expensesAbsorbedByBiz > 0 ? `Absorbió ${cur(m.expensesAbsorbedByBiz)} en gastos` : null },
                  { n: config.partner1, p: '45%', v: m.s1, sub: m.deficitCoveredBySocia > 0 ? `Cubrió ${cur(m.deficitCoveredBySocia)} de déficit` : null },
                  { n: config.partner2, p: '45%', v: m.s2, sub: m.deficitCoveredBySocia > 0 ? `Cubrió ${cur(m.deficitCoveredBySocia)} de déficit` : null },
                ].map((x, i) => (
                  <div key={i} className="neu-card" style={{ flex: 1, textAlign: 'center', padding: 10 }}>
                    <div style={{ fontSize: 8, color: '#6B7280' }}>{x.n} ({x.p})</div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3, color: x.v < 0 ? '#C0504E' : (x.c || '#4A6FA5') }}>{cur(x.v)}</div>
                    {x.sub && <div style={{ fontSize: 7, color: '#9CA3AF', marginTop: 3, lineHeight: 1.3 }}>{x.sub}</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 10, textAlign: 'center', fontStyle: 'italic', lineHeight: 1.5 }}>
                * Ingresos = ventas del periodo (cobradas o no). Ganancia neta = ingresos − costos − gastos.<br/>
                Gastos salen primero del 10% de SPLENDORA; si no alcanza, socias cubren el déficit 50/50.
              </div>
            </div>

            {/* MONTHLY SALES CHART */}
            <div className="neu-card" style={{ padding: 14, marginBottom: 14 }}>
              <div onClick={() => toggleDash(setFinChart, finChart, 'fin_chart')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: finChart ? 10 : 0, userSelect: 'none' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5 }}>📊 Ventas por mes — {new Date().getFullYear()}</div>
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{finChart ? '▾' : '▸'}</span>
              </div>
              {finChart && <SalesChart orders={orders} />}
            </div>

            {/* GASTOS */}
            <div className="neu-card" style={{ padding: 14 }}>
              <div onClick={() => toggleDash(setFinGastos, finGastos, 'fin_gastos')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: finGastos ? 10 : 0, userSelect: 'none' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  Gastos ({filteredExpenses.length}){filteredExpenses.length > 0 ? ` · ${cur(m.ex)}` : ''}
                </div>
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{finGastos ? '▾' : '▸'}</span>
              </div>
              {finGastos && (
                filteredExpenses.length === 0 ? (
                  <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 24, color: '#9CA3AF', fontSize: 12 }}>Sin gastos en este periodo</div>
                ) : filteredExpenses.map(e => (
                  <div key={e.id} className="neu-card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{e.description}</div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>{new Date(e.created_at).toLocaleDateString('es-CO')} · {e.paid_by}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>{cur(e.amount)}</span>
                      <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => deleteExpense(e.id)} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══ CATALOG ═══ */}
        {tab === 'catalog' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Catálogo</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="neu-btn neu-btn-sm" onClick={() => setShowCatCfg(true)}>🎨 Config</button>
                <a href="/catalogo" target="_blank" className="neu-btn neu-btn-accent neu-btn-sm" style={{ textDecoration: 'none' }}>🌐 Ver público</a>
              </div>
            </div>
            <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 12 }}>Sube tu logo, configura banner y promociones.</p>

            {catCfg.banner_active && (catCfg.banner_text || catCfg.banner_image) && (
              <div className="neu-card" style={{ padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4A6FA5', marginBottom: 6 }}>BANNER ACTIVO</div>
                {catCfg.banner_image && <img src={catCfg.banner_image} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />}
                {catCfg.banner_text && <div style={{ fontSize: 12, fontWeight: 600 }}>{catCfg.banner_text}</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
              {['Todas', ...categories].map(c => (
                <button key={c} className="neu-btn neu-btn-sm" onClick={() => setCatFilter(c)}
                  style={{ whiteSpace: 'nowrap', fontSize: 10, ...(catFilter === c ? { boxShadow: 'var(--pressed)', color: '#4A6FA5', fontWeight: 800 } : {}) }}>
                  {c}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {products.filter(p => p.stock > 0 && (catFilter === 'Todas' || (p.categories || [p.category]).includes(catFilter))).map(p => (
                <div key={p.id} className="neu-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ height: 90, boxShadow: 'var(--pressed)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: 6, borderRadius: 8 }}>
                    {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ fontSize: 22, color: '#9CA3AF' }}>📦</span>}
                  </div>
                  <div style={{ padding: '2px 10px 10px' }}>
                    <div style={{ fontSize: 7, color: '#4A6FA5', fontWeight: 700 }}>{p.code}</div>
                    <div style={{ fontWeight: 700, fontSize: 10, lineHeight: 1.3, height: 26, overflow: 'hidden' }}>{p.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{p.hide_price ? '—' : cur(p.price)}</div>
                      <div style={{ fontSize: 8, color: '#9CA3AF' }}>×{p.stock}</div>
                    </div>
                    <button className="neu-btn neu-btn-sm" style={{ width: '100%', marginTop: 6, fontSize: 9, padding: '5px 8px' }}
                      onClick={() => {
                        const url = `${window.location.origin}/catalogo?code=${encodeURIComponent(p.code)}`;
                        navigator.clipboard?.writeText(url);
                        alert('🔗 Link del producto copiado:\n' + url);
                      }}>
                      🔗 Copiar link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ TOOLS ═══ */}
        {tab === 'tools' && (
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800 }}>Herramientas</h2>
            <div className="neu-card" style={{ marginBottom: 12 }}>
              <div className="label">Respaldo Excel</div>
              <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Exporta con el filtro de mes actual.</p>
              <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => dlExcel(products, orders, expenses, config, fMonth, fYear)}>⬇ Descargar Excel</button>
            </div>
            <div className="neu-card" style={{ marginBottom: 12 }}>
              <div className="label">Catálogo público</div>
              <div className="neu-card neu-pressed" style={{ padding: 10, fontSize: 12, fontWeight: 600, wordBreak: 'break-all', marginBottom: 8 }}>
                {typeof window !== 'undefined' ? `${window.location.origin}/catalogo` : '/catalogo'}
              </div>
              <button className="neu-btn" style={{ width: '100%' }} onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/catalogo`); alert('¡Link copiado!'); }}>📋 Copiar link</button>
            </div>

            {/* CATEGORY MANAGEMENT */}
            <div className="neu-card" style={{ marginBottom: 12 }}>
              <div className="label">Categorías</div>
              <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 10 }}>Agrega o quita categorías para tus productos.</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input className="neu-input" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nueva categoría..." onKeyDown={e => { if (e.key === 'Enter') addCategory(newCat); }} />
                <button className="neu-btn neu-btn-accent" onClick={() => addCategory(newCat)} style={{ padding: '10px 16px', flexShrink: 0 }}>+</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map(c => (
                  <div key={c} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: '#F0F2F5', boxShadow: 'var(--raised-sm)',
                  }}>
                    <span>{c}</span>
                    <button onClick={() => deleteCategory(c)} style={{
                      background: 'none', border: 'none', color: '#C0504E', cursor: 'pointer',
                      fontSize: 14, padding: 0, lineHeight: 1, display: 'flex',
                    }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      <Modal open={showProd} onClose={() => setShowProd(false)} title={editProd ? 'Editar producto' : 'Nuevo producto'}>
        <ProductForm initial={editProd} categories={categories} existingProducts={products} editingId={editProd?.id}
          onSave={async p => {
            const res = await saveProduct(p, editProd?.id);
            if (res.ok) setShowProd(false);
            else alert('❌ ' + res.error);
          }} />
      </Modal>
      <Modal open={showOrd} onClose={() => setShowOrd(false)} title="Nuevo pedido" wide>
        <OrderForm products={products} onSave={async o => { await saveOrder(o); setShowOrd(false); }} />
      </Modal>
      <Modal open={showExp} onClose={() => setShowExp(false)} title="Registrar gasto">
        <ExpenseForm config={config} onSave={async e => { await saveExpense(e); setShowExp(false); }} />
      </Modal>
      <Modal open={showCfg} onClose={() => setShowCfg(false)} title="Socias">
        <CfgForm config={config} onSave={saveConfig} />
      </Modal>
      <Modal open={showCatCfg} onClose={() => setShowCatCfg(false)} title="Configurar catálogo">
        <CatCfgForm cfg={catCfg} onSave={saveCatCfg} />
      </Modal>
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="📦 Carga masiva de productos" wide>
        <BulkForm categories={categories} existingProducts={products} onSave={async (items) => {
          const errors = [];
          for (const prod of items) {
            try {
              const { data: cnt } = await supabase.from('counters').select('value').eq('id', 'product_code').single();
              const code = genCode(prod.category || prod.productCategories?.[0] || 'Otro', cnt?.value || 1);
              const { error } = await supabase.from('products').insert({ ...prod, code });
              if (error) throw error;
              await supabase.from('counters').update({ value: (cnt?.value || 1) + 1 }).eq('id', 'product_code');
            } catch (err) {
              errors.push(`"${prod.name}": ${/duplicate|unique/i.test(err?.message || '') ? 'nombre duplicado' : (err?.message || 'error')}`);
            }
          }
          if (errors.length > 0) {
            alert(`❌ No se guardaron ${errors.length} producto(s):\n\n${errors.join('\n')}\n\nLos demás se guardaron correctamente.`);
          }
          setShowBulk(false);
          loadAll();
        }} />
      </Modal>

      {/* NAV */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#F0F2F5', padding: '6px 10px max(6px, env(safe-area-inset-bottom))', zIndex: 999 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', borderRadius: 16, boxShadow: 'var(--raised)', padding: '5px 2px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '5px 8px', borderRadius: 12,
              boxShadow: tab === t.id ? 'var(--pressed)' : 'none',
              color: tab === t.id ? '#4A6FA5' : '#9CA3AF',
              fontFamily: "'Montserrat', sans-serif",
            }}>
              <span style={{ fontSize: 9, fontWeight: tab === t.id ? 800 : 500 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════
// FORMS
// ════════════════════════

function ProductForm({ initial, onSave, categories, existingProducts = [], editingId }) {
  const [f, setF] = useState(initial ? {
    name: initial.name, category: initial.category,
    productCategories: initial.categories || (initial.category ? [initial.category] : []),
    size: initial.size,
    sizes: initial.sizes || [], color: initial.color || '',
    colors: initial.colors || (initial.color ? [initial.color] : []),
    cost_product: initial.cost_product, cost_bag: initial.cost_bag,
    cost_shipping: initial.cost_shipping, price: initial.price, stock: initial.stock,
    description: initial.description, photo_url: initial.photo_url,
    photo_url_2: initial.photo_url_2 || '',
    extra_photos: initial.extra_photos || [],
    discount: initial.discount || 0, hide_price: initial.hide_price || false,
  } : {
    name: '', category: 'Blusas', productCategories: [], size: 'M', sizes: [], color: '', colors: [],
    cost_product: 0, cost_bag: 0, cost_shipping: 0, price: 0, stock: 1,
    description: '', photo_url: '', photo_url_2: '', extra_photos: [], discount: 0, hide_price: false,
  });

  // Detección de nombre duplicado (case-insensitive, ignora espacios)
  const normalizedName = normalizeName(f.name);
  const duplicate = normalizedName ? existingProducts.find(p => p.id !== editingId && normalizeName(p.name) === normalizedName) : null;
  const isDuplicate = !!duplicate;

  const [uploading, setUploading] = useState(false);
  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const refExtra = useRef(null);
  const ct = (Number(f.cost_product) || 0) + (Number(f.cost_bag) || 0) + (Number(f.cost_shipping) || 0);
  const mg = f.price > 0 ? ((f.price - ct) / f.price * 100).toFixed(1) : 0;

  async function handleUpload(field, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setF(prev => ({ ...prev, [field]: url }));
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setUploading(false);
  }

  return (
    <div>
      {/* PHOTO UPLOADS */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Fotos del producto</label>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          {/* Photo 1 */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 4, textAlign: 'center', fontWeight: 600 }}>📷 Principal</div>
            <div onClick={() => ref1.current?.click()} style={{
              width: '100%', height: 90, borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: f.photo_url ? 'var(--raised-sm)' : 'var(--pressed)',
            }}>
              {f.photo_url
                ? <img src={f.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 10 }}>{uploading ? '...' : '+ Foto 1'}</div>
              }
            </div>
            <input ref={ref1} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload('photo_url', e)} />
            {f.photo_url && <button className="neu-btn neu-btn-sm" style={{ width: '100%', marginTop: 4, fontSize: 9 }} onClick={() => setF({ ...f, photo_url: '' })}>Quitar</button>}
          </div>

          {/* Photo 2 */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 4, textAlign: 'center', fontWeight: 600 }}>📷 Secundaria</div>
            <div onClick={() => ref2.current?.click()} style={{
              width: '100%', height: 90, borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: f.photo_url_2 ? 'var(--raised-sm)' : 'var(--pressed)',
            }}>
              {f.photo_url_2
                ? <img src={f.photo_url_2} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 10 }}>{uploading ? '...' : '+ Foto 2'}</div>
              }
            </div>
            <input ref={ref2} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload('photo_url_2', e)} />
            {f.photo_url_2 && <button className="neu-btn neu-btn-sm" style={{ width: '100%', marginTop: 4, fontSize: 9 }} onClick={() => setF({ ...f, photo_url_2: '' })}>Quitar</button>}
          </div>
        </div>

        {/* Extra photos */}
        {f.extra_photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {f.extra_photos.map((url, i) => (
              <div key={i} style={{ position: 'relative', width: 70, height: 70 }}>
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, boxShadow: 'var(--raised-sm)' }} />
                <button onClick={() => setF(prev => ({ ...prev, extra_photos: prev.extra_photos.filter((_, j) => j !== i) }))}
                  style={{ position: 'absolute', top: -4, right: -4, background: '#C0504E', color: '#FFF', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
          </div>
        )}

        <input ref={refExtra} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          try {
            const url = await uploadPhoto(file);
            setF(prev => ({ ...prev, extra_photos: [...prev.extra_photos, url] }));
          } catch (err) { alert('Error: ' + err.message); }
          setUploading(false);
          if (refExtra.current) refExtra.current.value = '';
        }} />
        <button type="button" className="neu-btn neu-btn-sm" onClick={() => refExtra.current?.click()} style={{ width: '100%', fontSize: 10 }}>
          {uploading ? 'Subiendo...' : `📷 + Agregar más fotos (${f.extra_photos.length} extras)`}
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="label">Nombre {isDuplicate && <span style={{ color: '#C0504E', fontSize: 9, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>⚠ Ya existe</span>}</label>
        <input
          className="neu-input"
          value={f.name}
          onChange={e => setF({ ...f, name: e.target.value })}
          placeholder="Ej: Blusa floral"
          style={isDuplicate ? { boxShadow: 'inset 0 0 0 2px #C0504E, inset 3px 3px 6px #FCA5A5, inset -3px -3px 6px #FEE2E2', color: '#C0504E' } : {}}
        />
        {isDuplicate && (
          <div style={{ fontSize: 10, color: '#C0504E', marginTop: 6, padding: '6px 10px', background: '#FEE2E2', borderRadius: 8 }}>
            Ya existe un producto con este nombre: <b>{duplicate.code}</b> — cambia el nombre para evitar duplicados en el inventario.
          </div>
        )}
      </div>

      {/* MULTIPLE CATEGORIES */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Categorías (selecciona una o varias)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} type="button" className="neu-btn neu-btn-sm"
              onClick={() => setF(prev => ({
                ...prev,
                productCategories: prev.productCategories.includes(c)
                  ? prev.productCategories.filter(x => x !== c)
                  : [...prev.productCategories, c],
                category: prev.productCategories.includes(c)
                  ? (prev.productCategories.filter(x => x !== c)[0] || '')
                  : c,
              }))}
              style={{
                padding: '6px 14px',
                ...(f.productCategories.includes(c) ? { background: '#4A6FA5', color: '#FFF', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.2)' } : {}),
              }}>
              {c}
            </button>
          ))}
        </div>
        {f.productCategories.length === 0 && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6 }}>Selecciona al menos una categoría</div>}
      </div>

      {/* MULTIPLE COLORS */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Colores disponibles</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {['Negro', 'Blanco', 'Rojo', 'Azul', 'Rosa', 'Verde', 'Beige', 'Gris', 'Café', 'Morado'].map(c => (
            <button key={c} type="button" className="neu-btn neu-btn-sm"
              onClick={() => setF(prev => ({
                ...prev,
                colors: prev.colors.includes(c) ? prev.colors.filter(x => x !== c) : [...prev.colors, c],
                color: prev.colors.includes(c) ? (prev.colors.filter(x => x !== c)[0] || '') : c,
              }))}
              style={{
                padding: '5px 12px', fontSize: 10,
                ...(f.colors.includes(c) ? { background: '#4A6FA5', color: '#FFF', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.2)' } : {}),
              }}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="neu-input" value={f._customColor || ''} onChange={e => setF({ ...f, _customColor: e.target.value })} placeholder="Otro color personalizado..." style={{ fontSize: 11 }} />
          <button type="button" className="neu-btn neu-btn-sm" onClick={() => {
            if (f._customColor && f._customColor.trim() && !f.colors.includes(f._customColor.trim())) {
              setF(prev => ({ ...prev, colors: [...prev.colors, prev._customColor.trim()], color: prev._customColor.trim(), _customColor: '' }));
            }
          }} style={{ padding: '8px 14px', flexShrink: 0 }}>+</button>
        </div>
        {f.colors.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
            {f.colors.filter(c => !['Negro','Blanco','Rojo','Azul','Rosa','Verde','Beige','Gris','Café','Morado'].includes(c)).map(c => (
              <span key={c} style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#4A6FA5', color: '#FFF', display: 'flex', alignItems: 'center', gap: 4 }}>
                {c}
                <button type="button" onClick={() => setF(prev => ({ ...prev, colors: prev.colors.filter(x => x !== c) }))} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* MULTIPLE SIZES */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Tallas disponibles (selecciona varias)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SIZES_LIST.map(s => (
            <button key={s} type="button" className="neu-btn neu-btn-sm"
              onClick={() => setF(prev => ({
                ...prev,
                sizes: prev.sizes.includes(s) ? prev.sizes.filter(x => x !== s) : [...prev.sizes, s]
              }))}
              style={{
                padding: '6px 14px',
                ...(f.sizes.includes(s) ? { background: '#4A6FA5', color: '#FFF', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.2)' } : {}),
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="label">Costos</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Fld label="Producto $"><input className="neu-input" type="number" value={f.cost_product} onChange={e => setF({ ...f, cost_product: Number(e.target.value) })} /></Fld>
        <Fld label="Bolsa $"><input className="neu-input" type="number" value={f.cost_bag} onChange={e => setF({ ...f, cost_bag: Number(e.target.value) })} /></Fld>
        <Fld label="Envío $"><input className="neu-input" type="number" value={f.cost_shipping} onChange={e => setF({ ...f, cost_shipping: Number(e.target.value) })} /></Fld>
      </div>
      <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 10, marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>Costo total: {cur(ct)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fld label="Precio venta"><input className="neu-input" type="number" value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) })} /></Fld>
        <Fld label="Stock"><input className="neu-input" type="number" value={f.stock} onChange={e => setF({ ...f, stock: Number(e.target.value) })} /></Fld>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fld label="Descuento %"><input className="neu-input" type="number" min="0" max="99" value={f.discount} onChange={e => setF({ ...f, discount: Number(e.target.value) })} /></Fld>
        <Fld label="¿Ocultar precio público?">
          <button type="button" className="neu-btn" style={{ width: '100%', ...(f.hide_price ? { background: '#4A6FA5', color: '#FFF' } : {}) }}
            onClick={() => setF({ ...f, hide_price: !f.hide_price })}>
            {f.hide_price ? 'Sí — Oculto' : 'No — Visible'}
          </button>
        </Fld>
      </div>

      {f.price > 0 && (
        <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: Number(mg) >= 30 ? '#4A9E6B' : '#D4A843' }}>
            Margen: {mg}% · {cur(f.price - ct)}/u
          </span>
        </div>
      )}

      <Fld label="Descripción (opc.)"><input className="neu-input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Material, detalles..." /></Fld>

      <button className="neu-btn neu-btn-accent" style={{ width: '100%', ...(isDuplicate ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
        disabled={isDuplicate}
        onClick={() => {
          if (!f.name) return alert('Nombre requerido');
          if (isDuplicate) return alert('Ya existe un producto con ese nombre. Cambia el nombre antes de guardar.');
          if (f.productCategories.length === 0) return alert('Selecciona al menos una categoría');
          onSave({ ...f, cost_total: ct, categories: f.productCategories, category: f.productCategories[0] });
        }}>
        {initial ? 'Guardar cambios' : 'Agregar producto'}
      </button>
    </div>
  );
}

function OrderForm({ products, onSave }) {
  const [f, setF] = useState({
    customer_name: '', city: '', channel: 'WhatsApp', shipping_charge: 0, items: [],
    payment_status: 'pending', amount_paid: 0, payment_notes: '',
  });
  const [sel, setSel] = useState('');
  const [qty, setQty] = useState(1);
  const [selSize, setSelSize] = useState('');
  const [selColor, setSelColor] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const av = products.filter(p => p.stock > 0);
  const selProd = av.find(p => p.id === sel);

  // Filtrar productos disponibles por búsqueda (nombre, código o categoría)
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return av;
    const q = productSearch.trim().toLowerCase();
    return av.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q) ||
      (p.categories || [p.category]).join(' ').toLowerCase().includes(q)
    );
  }, [av, productSearch]);

  const selProdSizes = selProd ? (selProd.sizes && selProd.sizes.length > 0 ? selProd.sizes : (selProd.size ? [selProd.size] : [])) : [];
  const selProdColors = selProd ? (selProd.colors && selProd.colors.length > 0 ? selProd.colors : (selProd.color ? [selProd.color] : [])) : [];

  // Precio efectivo = precio con descuento aplicado (igual al catálogo público)
  const effectivePrice = (p) => {
    if (!p) return 0;
    return p.discount > 0 ? Math.round((p.price || 0) * (1 - p.discount / 100)) : (p.price || 0);
  };

  const st = f.items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const cT = f.items.reduce((s, i) => s + (i.costUnit || 0) * (i.qty || 0), 0);
  const tot = st + Number(f.shipping_charge || 0);

  const displayAmountPaid = f.payment_status === 'paid' ? tot : (f.payment_status === 'pending' ? 0 : f.amount_paid);
  const due = Math.max(0, tot - displayAmountPaid);

  function addItem() {
    if (!selProd) return;
    const size = selSize || selProdSizes[0] || '';
    const color = selColor || selProdColors[0] || '';
    if (f.items.find(i => i.productId === selProd.id && i.size === size && i.color === color)) {
      alert('Ese producto con esa talla/color ya está en el pedido'); return;
    }
    const reservado = f.items.filter(i => i.productId === selProd.id).reduce((s, i) => s + (i.qty || 0), 0);
    const disponible = (selProd.stock || 0) - reservado;
    if (qty > disponible) {
      alert(`Solo hay ${disponible} unidad(es) disponible(s) de ${selProd.name}`); return;
    }
    const price = effectivePrice(selProd);
    setF({ ...f, items: [...f.items, { productId: selProd.id, name: selProd.name, code: selProd.code, qty, size, color, priceUnit: price, costUnit: selProd.cost_total, subtotal: price * qty }] });
    setSel(''); setQty(1); setSelSize(''); setSelColor(''); setProductSearch('');
  }

  function updateItemPrice(idx, newPrice) {
    const p = Number(newPrice) || 0;
    setF(prev => ({
      ...prev,
      items: prev.items.map((i, j) => j === idx ? { ...i, priceUnit: p, subtotal: p * (i.qty || 0) } : i)
    }));
  }

  function updateItemQty(idx, newQty) {
    const q = Math.max(1, Number(newQty) || 1);
    const it = f.items[idx];
    const prod = products.find(p => p.id === it.productId);
    if (prod) {
      const reservadoOtros = f.items.filter((i, j) => j !== idx && i.productId === it.productId).reduce((s, i) => s + (i.qty || 0), 0);
      const disponible = (prod.stock || 0) - reservadoOtros;
      if (q > disponible) { alert(`Solo hay ${disponible} disponible(s) de ${prod.name}`); return; }
    }
    setF(prev => ({
      ...prev,
      items: prev.items.map((i, j) => j === idx ? { ...i, qty: q, subtotal: (i.priceUnit || 0) * q } : i)
    }));
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Fld label="Clienta"><input className="neu-input" value={f.customer_name} onChange={e => setF({ ...f, customer_name: e.target.value })} placeholder="Nombre o @instagram" /></Fld>
        <Fld label="Ciudad"><input className="neu-input" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder="Ej: Manizales" /></Fld>
      </div>
      <Fld label="Canal">
        <select className="neu-select" value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}>
          {['WhatsApp', 'Instagram', 'Facebook', 'Presencial', 'Otro'].map(c => <option key={c}>{c}</option>)}
        </select>
      </Fld>

      <div className="label">Buscar producto</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input className="neu-input" value={productSearch} onChange={e => setProductSearch(e.target.value)}
          placeholder="Nombre, código o categoría..." style={{ flex: 1 }} />
        {productSearch && (
          <button className="neu-btn neu-btn-sm" onClick={() => setProductSearch('')} style={{ padding: '0 12px' }}>✕</button>
        )}
      </div>

      {/* Lista de productos filtrada */}
      {filteredProducts.length === 0 ? (
        <div className="neu-card neu-pressed" style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>
          {productSearch ? `Sin resultados para "${productSearch}"` : 'No hay productos con stock'}
        </div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8, borderRadius: 12, boxShadow: 'var(--pressed)', background: '#F0F2F5' }}>
          {filteredProducts.slice(0, 50).map(p => {
            const isSel = sel === p.id;
            const disc = p.discount > 0;
            const fp = disc ? Math.round(p.price * (1 - p.discount / 100)) : p.price;
            return (
              <div key={p.id} onClick={() => { setSel(p.id); setSelSize(''); setSelColor(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  cursor: 'pointer',
                  background: isSel ? '#E8EAED' : 'transparent',
                  borderBottom: '1px solid #E5E7EB',
                  ...(isSel ? { borderLeft: '3px solid #4A6FA5' } : {}),
                }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.photo_url
                    ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 16, color: '#9CA3AF' }}>📦</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 9, color: '#6B7280' }}>{p.code} · Stock: {p.stock}{disc ? ` · -${p.discount}%` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{cur(fp)}</div>
                  {disc && <div style={{ fontSize: 8, color: '#9CA3AF', textDecoration: 'line-through' }}>{cur(p.price)}</div>}
                </div>
              </div>
            );
          })}
          {filteredProducts.length > 50 && (
            <div style={{ padding: '6px 10px', fontSize: 9, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' }}>
              Mostrando 50 de {filteredProducts.length} · afina la búsqueda para ver más
            </div>
          )}
        </div>
      )}

      {/* Detalle del producto seleccionado */}
      {selProd && (
        <div className="neu-card" style={{ padding: 12, marginBottom: 8, border: '2px solid #4A6FA5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: '#4A6FA5', fontWeight: 700 }}>SELECCIONADO</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{selProd.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {selProd.discount > 0 && <div style={{ fontSize: 9, color: '#9CA3AF', textDecoration: 'line-through' }}>{cur(selProd.price)}</div>}
              <div style={{ fontSize: 14, fontWeight: 800, color: selProd.discount > 0 ? '#C0504E' : '#1A1D23' }}>{cur(effectivePrice(selProd))}</div>
            </div>
          </div>

          {selProdSizes.length > 0 && (
            <div style={{ marginBottom: selProdColors.length > 0 ? 8 : 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Talla</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selProdSizes.map(s => (
                  <button key={s} type="button" className="neu-btn neu-btn-sm" onClick={() => setSelSize(s)}
                    style={{ padding: '4px 10px', fontSize: 10, ...((selSize || selProdSizes[0]) === s ? { background: '#4A6FA5', color: '#FFF' } : {}) }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selProdColors.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 }}>Color</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selProdColors.map(c => (
                  <button key={c} type="button" className="neu-btn neu-btn-sm" onClick={() => setSelColor(c)}
                    style={{ padding: '4px 10px', fontSize: 10, ...((selColor || selProdColors[0]) === c ? { background: '#4A6FA5', color: '#FFF' } : {}) }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>Cant.</div>
            <input className="neu-input" type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} style={{ width: 60 }} />
          </div>
        </div>
      )}

      <button className="neu-btn neu-btn-accent" style={{ width: '100%', marginBottom: 12 }} onClick={addItem} disabled={!selProd}>
        + Agregar al pedido
      </button>

      {f.items.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="label">Productos del pedido</div>
          {f.items.map((it, i) => (
            <div key={i} style={{ padding: '10px 12px', background: '#F0F2F5', boxShadow: 'var(--raised-sm)', borderRadius: 10, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{it.name}</div>
                  <div style={{ fontSize: 9, color: '#6B7280' }}>{it.code}{it.size ? ` · T: ${it.size}` : ''}{it.color ? ` · ${it.color}` : ''}</div>
                </div>
                <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} style={{ padding: '2px 6px', flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 6, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 8, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Cant.</div>
                  <input className="neu-input" type="number" min="1" value={it.qty} onChange={e => updateItemQty(i, e.target.value)}
                    style={{ padding: '6px 8px', fontSize: 12, textAlign: 'center' }} />
                </div>
                <div>
                  <div style={{ fontSize: 8, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Precio u.</div>
                  <input className="neu-input" type="number" min="0" value={it.priceUnit} onChange={e => updateItemPrice(i, e.target.value)}
                    style={{ padding: '6px 8px', fontSize: 12 }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 8, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Subtotal</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D23' }}>{cur(it.subtotal)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Fld label="Envío cobrado a la clienta"><input className="neu-input" type="number" value={f.shipping_charge} onChange={e => setF({ ...f, shipping_charge: Number(e.target.value) })} /></Fld>

      <div className="neu-card neu-pressed" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
          <span>Subtotal productos</span>
          <span>{cur(st)}</span>
        </div>
        {Number(f.shipping_charge || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
            <span>Envío</span>
            <span>{cur(Number(f.shipping_charge || 0))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #E5E7EB', marginTop: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Total del pedido</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{cur(tot)}</span>
        </div>
      </div>

      {/* ── SECCIÓN DE PAGO ── */}
      <div style={{ padding: '12px 14px', marginBottom: 14, borderRadius: 12, background: '#F0F2F5', boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF' }}>
        <div className="label" style={{ marginBottom: 10 }}>Estado del pago</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { k: 'pending', label: '○ Pendiente' },
            { k: 'partial', label: '◐ Abono' },
            { k: 'paid', label: '● Pagado' },
          ].map(opt => (
            <button key={opt.k} type="button" className="neu-btn neu-btn-sm"
              onClick={() => {
                if (opt.k === 'paid') setF({ ...f, payment_status: 'paid', amount_paid: tot });
                else if (opt.k === 'pending') setF({ ...f, payment_status: 'pending', amount_paid: 0 });
                else setF({ ...f, payment_status: 'partial' });
              }}
              style={{
                flex: 1, padding: '8px 6px', fontSize: 10,
                ...(f.payment_status === opt.k ? { background: PAYMENT_STATUS[opt.k].bg, color: PAYMENT_STATUS[opt.k].color, fontWeight: 800, boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.1)' } : {})
              }}>
              {opt.label}
            </button>
          ))}
        </div>

        {f.payment_status === 'partial' && (
          <div style={{ marginBottom: 10 }}>
            <label className="label">¿Cuánto abonó?</label>
            <input className="neu-input" type="number" min="0" max={tot} value={f.amount_paid}
              onChange={e => {
                let v = Number(e.target.value);
                if (v < 0) v = 0;
                if (v > tot) { setF({ ...f, amount_paid: tot, payment_status: 'paid' }); return; }
                setF({ ...f, amount_paid: v });
              }} placeholder="Ej: 30000" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 6, padding: '0 4px' }}>
              <span style={{ color: '#4A9E6B' }}>Abonado: <b>{cur(f.amount_paid)}</b></span>
              <span style={{ color: '#C0504E' }}>Por cobrar: <b>{cur(due)}</b></span>
            </div>
          </div>
        )}

        <Fld label="Notas de pago (opcional)">
          <input className="neu-input" value={f.payment_notes} onChange={e => setF({ ...f, payment_notes: e.target.value })} placeholder="Paga el viernes, transferencia Nequi..." />
        </Fld>
      </div>

      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }}
        onClick={() => {
          if (!f.customer_name) return alert('Falta el nombre de la clienta');
          if (!f.items.length) return alert('Agrega al menos un producto');
          const ap = f.payment_status === 'paid' ? tot : (f.payment_status === 'pending' ? 0 : Number(f.amount_paid || 0));
          if (f.payment_status === 'partial' && ap <= 0) return alert('Indica el monto que abonó (o cambia a "Pendiente")');
          onSave({
            customer_name: f.customer_name, city: f.city, channel: f.channel,
            items: f.items, shipping_charge: Number(f.shipping_charge || 0),
            total: tot, cost_total: cT,
            payment_status: f.payment_status, amount_paid: ap, payment_notes: f.payment_notes,
          });
        }}>
        Crear pedido
      </button>
    </div>
  );
}

function ExpenseForm({ config, onSave }) {
  const [f, setF] = useState({ description: '', amount: 0, paid_by: config.partner1 });
  return (
    <div>
      <Fld label="Descripción"><input className="neu-input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Envío, publicidad..." /></Fld>
      <Fld label="Monto"><input className="neu-input" type="number" value={f.amount} onChange={e => setF({ ...f, amount: Number(e.target.value) })} /></Fld>
      <Fld label="¿Quién pagó?">
        <select className="neu-select" value={f.paid_by} onChange={e => setF({ ...f, paid_by: e.target.value })}>
          <option>{config.partner1}</option>
          <option>{config.partner2}</option>
          <option>SPLENDORA (negocio)</option>
        </select>
      </Fld>
      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }}
        onClick={() => { if (!f.description || !f.amount) return alert('Completa campos'); onSave(f); }}>
        Registrar
      </button>
    </div>
  );
}

function CfgForm({ config, onSave }) {
  const [c, setC] = useState(config);
  return (
    <div>
      <Fld label="Socia 1"><input className="neu-input" value={c.partner1} onChange={e => setC({ ...c, partner1: e.target.value })} /></Fld>
      <Fld label="Socia 2"><input className="neu-input" value={c.partner2} onChange={e => setC({ ...c, partner2: e.target.value })} /></Fld>
      <div className="neu-card neu-pressed" style={{ padding: 12, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>División fija: 10% SPLENDORA · 45% {c.partner1} · 45% {c.partner2}</div>
      </div>
      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => onSave(c)}>Guardar</button>
    </div>
  );
}

function CatCfgForm({ cfg, onSave }) {
  const [c, setC] = useState(cfg);
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef(null);
  const bannerRef = useRef(null);

  async function handleUpload(field, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setC(prev => ({ ...prev, [field]: url }));
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setUploading(false);
  }

  return (
    <div>
      {/* LOGO UPLOAD */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Logo de la marca</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div onClick={() => logoRef.current?.click()} style={{
            width: 70, height: 70, borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: c.logo_url ? 'var(--raised-sm)' : 'var(--pressed)',
          }}>
            {c.logo_url
              ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 9 }}>{uploading ? '...' : '+ Logo'}</div>
            }
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload('logo_url', e)} />
          {c.logo_url && <button className="neu-btn neu-btn-sm" onClick={() => setC({ ...c, logo_url: '' })}>Quitar</button>}
        </div>
      </div>

      <Fld label="Banner activo">
        <button type="button" className="neu-btn"
          style={{ width: '100%', ...(c.banner_active ? { background: '#4A6FA5', color: '#FFF' } : {}) }}
          onClick={() => setC({ ...c, banner_active: !c.banner_active })}>
          {c.banner_active ? 'Sí — Visible en catálogo' : 'No — Oculto'}
        </button>
      </Fld>

      <Fld label="Texto del banner">
        <input className="neu-input" value={c.banner_text} onChange={e => setC({ ...c, banner_text: e.target.value })} placeholder="🔥 20% OFF en toda la colección" />
      </Fld>

      {/* BANNER IMAGE */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Imagen del banner (opcional)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div onClick={() => bannerRef.current?.click()} style={{
            width: 140, height: 60, borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: c.banner_image ? 'var(--raised-sm)' : 'var(--pressed)',
          }}>
            {c.banner_image
              ? <img src={c.banner_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ color: '#9CA3AF', fontSize: 10 }}>{uploading ? '...' : '+ Imagen'}</div>
            }
          </div>
          <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload('banner_image', e)} />
          {c.banner_image && <button className="neu-btn neu-btn-sm" onClick={() => setC({ ...c, banner_image: '' })}>Quitar</button>}
        </div>
      </div>

      <Fld label="Instagram URL"><input className="neu-input" value={c.instagram_url} onChange={e => setC({ ...c, instagram_url: e.target.value })} /></Fld>
      <Fld label="WhatsApp (con código país, sin +)"><input className="neu-input" value={c.whatsapp_number} onChange={e => setC({ ...c, whatsapp_number: e.target.value })} placeholder="573172346822" /></Fld>

      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => onSave(c)}>Guardar configuración</button>
    </div>
  );
}

function BulkForm({ categories, existingProducts = [], onSave }) {
  const emptyRow = { name: '', category: categories[0] || 'Otro', productCategories: [], color: '', size: 'M', sizes: [], cost_product: 0, cost_bag: 0, cost_shipping: 0, price: 0, stock: 1, description: '', photo_url: '', photo_url_2: '', discount: 0, hide_price: false };
  const [rows, setRows] = useState([{ ...emptyRow }, { ...emptyRow }, { ...emptyRow }]);
  const [saving, setSaving] = useState(false);

  // Mapa de nombres existentes en DB (normalizados)
  const existingNames = useMemo(() => {
    const map = new Map();
    existingProducts.forEach(p => map.set(normalizeName(p.name), p.code));
    return map;
  }, [existingProducts]);

  // Para cada fila: está duplicado contra DB o contra otra fila?
  function getRowDupInfo(i) {
    const n = normalizeName(rows[i].name);
    if (!n) return null;
    if (existingNames.has(n)) return { type: 'db', code: existingNames.get(n) };
    // Duplicado dentro de las filas: primera fila con ese nombre "gana", las siguientes marcan duplicado
    for (let j = 0; j < i; j++) {
      if (normalizeName(rows[j].name) === n) return { type: 'row', rowIndex: j };
    }
    return null;
  }

  const anyDuplicate = rows.some((r, i) => r.name.trim() && getRowDupInfo(i));

  function updateRow(i, field, value) {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows(prev => [...prev, { ...emptyRow }]);
  }

  function removeRow(i) {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, j) => j !== i));
  }

  async function handleSave() {
    const valid = rows.filter(r => r.name.trim());
    if (valid.length === 0) return alert('Agrega al menos un producto con nombre');
    if (anyDuplicate) return alert('Hay nombres duplicados marcados en rojo. Corrige antes de guardar.');
    setSaving(true);
    const items = valid.map(r => ({
      ...r,
      name: r.name.trim(),
      cost_total: (Number(r.cost_product) || 0) + (Number(r.cost_bag) || 0) + (Number(r.cost_shipping) || 0),
      categories: r.productCategories.length > 0 ? r.productCategories : [r.category],
      category: r.productCategories.length > 0 ? r.productCategories[0] : r.category,
    }));
    await onSave(items);
    setSaving(false);
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 14 }}>
        Llena los datos de cada producto. Solo los que tengan nombre se guardarán. Los campos de costos y fotos los puedes editar después.
      </p>

      {rows.map((r, i) => {
        const dup = getRowDupInfo(i);
        return (
        <div key={i} className="neu-card" style={{ padding: 14, marginBottom: 10, position: 'relative', ...(dup ? { boxShadow: '0 0 0 2px #C0504E, 5px 5px 10px #D1D3D6, -5px -5px 10px #FFFFFF' } : {}) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: dup ? '#C0504E' : '#4A6FA5' }}>Producto {i + 1}{dup && ' ⚠'}</div>
            {rows.length > 1 && (
              <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => removeRow(i)} style={{ padding: '2px 8px', fontSize: 10 }}>✕</button>
            )}
          </div>

          {dup && (
            <div style={{ fontSize: 10, color: '#C0504E', padding: '6px 10px', background: '#FEE2E2', borderRadius: 8, marginBottom: 10 }}>
              {dup.type === 'db'
                ? <>Ya existe un producto con este nombre: <b>{dup.code}</b></>
                : <>Nombre duplicado con el producto <b>#{dup.rowIndex + 1}</b> en esta lista</>
              }
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label className="label">Nombre *</label>
              <input className="neu-input" value={r.name} onChange={e => updateRow(i, 'name', e.target.value)} placeholder="Ej: Blusa floral"
                style={{ fontSize: 12, ...(dup ? { boxShadow: 'inset 0 0 0 2px #C0504E, inset 3px 3px 6px #FCA5A5, inset -3px -3px 6px #FEE2E2', color: '#C0504E' } : {}) }} />
            </div>
            <div>
              <label className="label">Color</label>
              <input className="neu-input" value={r.color} onChange={e => updateRow(i, 'color', e.target.value)} placeholder="Negro..." style={{ fontSize: 12 }} />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label className="label">Categorías</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {categories.map(c => (
                <button key={c} type="button" onClick={() => {
                  const cur = r.productCategories || [];
                  updateRow(i, 'productCategories', cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]);
                }} style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif",
                  background: (r.productCategories || []).includes(c) ? '#4A6FA5' : '#F0F2F5',
                  color: (r.productCategories || []).includes(c) ? '#FFF' : '#6B7280',
                  boxShadow: (r.productCategories || []).includes(c) ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF',
                }}>{c}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            <div>
              <label className="label">Precio</label>
              <input className="neu-input" type="number" value={r.price} onChange={e => updateRow(i, 'price', Number(e.target.value))} style={{ fontSize: 12 }} />
            </div>
            <div>
              <label className="label">Costo</label>
              <input className="neu-input" type="number" value={r.cost_product} onChange={e => updateRow(i, 'cost_product', Number(e.target.value))} style={{ fontSize: 12 }} />
            </div>
            <div>
              <label className="label">Stock</label>
              <input className="neu-input" type="number" value={r.stock} onChange={e => updateRow(i, 'stock', Number(e.target.value))} style={{ fontSize: 12 }} />
            </div>
            <div>
              <label className="label">Desc. %</label>
              <input className="neu-input" type="number" value={r.discount} onChange={e => updateRow(i, 'discount', Number(e.target.value))} style={{ fontSize: 12 }} />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <label className="label">Tallas</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {SIZES_LIST.map(s => (
                <button key={s} type="button" onClick={() => {
                  const cur = r.sizes || [];
                  updateRow(i, 'sizes', cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
                }} style={{
                  padding: '3px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, border: 'none', cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif",
                  background: (r.sizes || []).includes(s) ? '#4A6FA5' : '#F0F2F5',
                  color: (r.sizes || []).includes(s) ? '#FFF' : '#6B7280',
                  boxShadow: (r.sizes || []).includes(s) ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF',
                }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      );})}

      <button className="neu-btn" style={{ width: '100%', marginBottom: 12 }} onClick={addRow}>
        + Agregar otro producto
      </button>

      {anyDuplicate && (
        <div style={{ fontSize: 10, color: '#C0504E', padding: '8px 12px', background: '#FEE2E2', borderRadius: 8, marginBottom: 10, textAlign: 'center' }}>
          ⚠ Corrige los nombres duplicados antes de guardar
        </div>
      )}

      <button className="neu-btn neu-btn-accent" style={{ width: '100%', ...(anyDuplicate ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} onClick={handleSave} disabled={saving || anyDuplicate}>
        {saving ? 'Guardando...' : `📦 Guardar ${rows.filter(r => r.name.trim()).length} producto(s)`}
      </button>
    </div>
  );
}
