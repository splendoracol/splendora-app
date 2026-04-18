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

const cur = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

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
  const done = fo.filter(o => o.status === 'delivered');
  const rv = done.reduce((a, o) => a + (o.total || 0), 0);
  const cs = done.reduce((a, o) => a + (o.cost_total || 0), 0);
  const ex = fe.reduce((a, x) => a + (x.amount || 0), 0);
  const nt = rv - cs - ex;
  const biz = nt * 0.1, dist = nt - biz, s1 = dist * 0.5, s2 = dist * 0.5;
  const mk = (nm, h, rows) => `<Worksheet ss:Name="${nm}"><Table><Row>${h.map(x => `<Cell ss:StyleID="h"><Data ss:Type="String">${x}</Data></Cell>`).join('')}</Row>${rows}</Table></Worksheet>`;
  const period = month !== null ? `${MONTHS[month]} ${year}` : 'Todo';
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Interior ss:Color="#2D3748" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style></Styles><Worksheet ss:Name="Resumen"><Table><Row><Cell ss:StyleID="h"><Data ss:Type="String">Concepto</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Valor</Data></Cell></Row><Row>${s('Periodo')}${s(period)}</Row><Row>${s('Ingresos')}${n(rv)}</Row><Row>${s('Costos')}${n(cs)}</Row><Row>${s('Gastos')}${n(ex)}</Row><Row>${s('Ganancia neta')}${n(nt)}</Row><Row>${s('SPLENDORA (10%)')}${n(biz)}</Row><Row>${s(config.partner1 + ' (45%)')}${n(s1)}</Row><Row>${s(config.partner2 + ' (45%)')}${n(s2)}</Row></Table></Worksheet>${mk('Inventario', ['Código', 'Nombre', 'Categoría', 'Tallas', 'Color', 'Costo', 'Precio', 'Stock', 'Descuento'], products.map(p => `<Row>${s(p.code)}${s(p.name)}${s((p.categories || [p.category]).join(', '))}${s((p.sizes || []).join(', ') || p.size)}${s(p.color)}${n(p.cost_total)}${n(p.price)}${n(p.stock)}${n(p.discount)}</Row>`).join(''))}${mk('Pedidos', ['Fecha', 'Cliente', 'Canal', 'Productos', 'Total', 'Costo', 'Estado'], fo.map(o => `<Row>${s(new Date(o.created_at).toLocaleDateString('es-CO'))}${s(o.customer_name)}${s(o.channel)}${s((o.items || []).map(i => i.name + ' x' + i.qty).join(', '))}${n(o.total)}${n(o.cost_total)}${s(STATUS[o.status]?.label || o.status)}</Row>`).join(''))}${mk('Gastos', ['Fecha', 'Descripción', 'Monto', 'Pagado por'], fe.map(x => `<Row>${s(new Date(x.created_at).toLocaleDateString('es-CO'))}${s(x.description)}${n(x.amount)}${s(x.paid_by)}</Row>`).join(''))}</Workbook>`;
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
    if (editId) {
      await supabase.from('products').update(prod).eq('id', editId);
    } else {
      const { data: cnt } = await supabase.from('counters').select('value').eq('id', 'product_code').single();
      const code = genCode(prod.category, cnt?.value || 1);
      await supabase.from('counters').update({ value: (cnt?.value || 1) + 1 }).eq('id', 'product_code');
      await supabase.from('products').insert({ ...prod, code });
    }
    loadAll();
  }
  async function deleteProduct(id) { await supabase.from('products').delete().eq('id', id); loadAll(); }
  async function saveOrder(ord) { await supabase.from('orders').insert(ord); loadAll(); }
  async function updateOrderStatus(id, status, items, prev) {
    await supabase.from('orders').update({ status }).eq('id', id);
    if (status === 'delivered' && prev !== 'delivered') {
      for (const it of (items || [])) {
        const p = products.find(x => x.id === it.productId);
        if (p) await supabase.from('products').update({ stock: Math.max(0, p.stock - it.qty) }).eq('id', p.id);
      }
    }
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
    const ic = products.reduce((s, p) => s + (p.cost_total || 0) * (p.stock || 0), 0);
    const ir = products.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0);
    const dn = filteredOrders.filter(o => o.status === 'delivered');
    const rv = dn.reduce((s, o) => s + (o.total || 0), 0);
    const cs = dn.reduce((s, o) => s + (o.cost_total || 0), 0);
    const ex = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const nt = rv - cs - ex;
    const biz = nt * 0.10;
    const dist = nt - biz;
    const s1 = dist * 0.5;
    const s2 = dist * 0.5;
    // Projected profit if all inventory sells
    const projProfit = products.reduce((s, p) => s + ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0), 0);
    const projBiz = projProfit * 0.10;
    const projDist = projProfit - projBiz;
    const projS1 = projDist * 0.5;
    const projS2 = projDist * 0.5;

    return {
      ic, ir, dn, rv, cs, ex, nt, biz, s1, s2,
      projProfit, projBiz, projS1, projS2,
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
                { l: 'Productos', v: products.length, s: `${m.out.length} agotados` },
                { l: 'Pedidos pend.', v: m.pnd.length, s: `${m.dn.length} entregados`, c: '#4A6FA5' },
                { l: 'Inversión', v: cur(m.ic), s: `Valor: ${cur(m.ir)}`, c: '#4A6FA5' },
                { l: 'Ganancia', v: cur(m.nt), s: `SPLENDORA: ${cur(m.biz)}`, c: m.nt >= 0 ? '#4A9E6B' : '#C0504E' },
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
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>División (10% / 45% / 45%)</div>
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
            </div>

            {/* Projected profit */}
            <div className="neu-card" style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>📊 Si vendes todo el inventario</div>
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
            </div>

            {/* Alerts */}
            {(m.low.length > 0 || m.out.length > 0) && (
              <div className="neu-card" style={{ marginTop: 14, padding: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#D4A843', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>⚠ Stock bajo</div>
                {m.out.map(p => <div key={p.id} style={{ fontSize: 11, color: '#C0504E', marginBottom: 3 }}><b>{p.code}</b> {p.name} — Agotado</div>)}
                {m.low.map(p => <div key={p.id} style={{ fontSize: 11, color: '#D4A843', marginBottom: 3 }}><b>{p.code}</b> {p.name} — {p.stock}</div>)}
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
            <div className="neu-card neu-pressed" style={{ padding: 0, marginBottom: 12 }}>
              <input className="neu-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ boxShadow: 'none', background: 'transparent' }} />
            </div>
            {products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase())).map(p => (
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
                    {(p.categories || [p.category]).join(', ')} · {(p.sizes || []).join(', ') || p.size}{p.color ? ` · ${p.color}` : ''} · {cur(p.price)}
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
            ))}
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
            {filteredOrders.length === 0 ? (
              <div className="neu-card" style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Sin pedidos en este periodo</div>
            ) : filteredOrders.map(o => (
              <div key={o.id} className="neu-card" style={{ padding: 14, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{(o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ')}</div>
                    <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>{o.channel} · {new Date(o.created_at).toLocaleDateString('es-CO')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{cur(o.total)}</div>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, marginTop: 3, fontSize: 9, fontWeight: 700, color: STATUS[o.status]?.color, boxShadow: 'var(--pressed)' }}>{STATUS[o.status]?.label}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS).filter(([k]) => k !== 'cancelled').map(([k, v]) => (
                    <button key={k} className="neu-btn neu-btn-sm" onClick={() => updateOrderStatus(o.id, k, o.items, o.status)}
                      style={{ padding: '4px 9px', fontSize: 9, ...(o.status === k ? { boxShadow: 'var(--pressed)', color: v.color, fontWeight: 800 } : {}) }}>
                      {v.label}
                    </button>
                  ))}
                  <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => updateOrderStatus(o.id, 'cancelled', o.items, o.status)}
                    style={{ padding: '4px 9px', fontSize: 9, marginLeft: 'auto' }}>Cancelar</button>
                </div>
              </div>
            ))}
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
                  { l: 'Ingresos', v: m.rv, c: '#4A9E6B' },
                  { l: 'Costos', v: m.cs },
                  { l: 'Gastos', v: m.ex, c: '#D4A843' },
                  { l: 'Ganancia neta', v: m.nt, c: m.nt >= 0 ? '#4A9E6B' : '#C0504E' },
                ].map((r, i) => (
                  <div key={i} className="neu-card neu-pressed" style={{ padding: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>{r.l}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: r.c || '#1A1D23' }}>{cur(r.v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {[
                  { n: 'SPLENDORA', p: '10%', v: m.biz, c: '#4A6FA5' },
                  { n: config.partner1, p: '45%', v: m.s1 },
                  { n: config.partner2, p: '45%', v: m.s2 },
                ].map((x, i) => (
                  <div key={i} className="neu-card" style={{ flex: 1, textAlign: 'center', padding: 10 }}>
                    <div style={{ fontSize: 8, color: '#6B7280' }}>{x.n} ({x.p})</div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3, color: x.c || '#4A6FA5' }}>{cur(x.v)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Gastos</div>
            {filteredExpenses.length === 0 ? (
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
            ))}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {products.filter(p => p.stock > 0 && (catFilter === 'Todas' || (p.categories || [p.category]).includes(catFilter))).map(p => (
                <div key={p.id} className="neu-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ height: 120, boxShadow: 'var(--pressed)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: 7, borderRadius: 10 }}>
                    {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ fontSize: 30, color: '#9CA3AF' }}>+</span>}
                  </div>
                  <div style={{ padding: '6px 12px 12px' }}>
                    <div style={{ fontSize: 8, color: '#4A6FA5', fontWeight: 700 }}>{p.code}</div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{p.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{p.hide_price ? 'Precio oculto' : cur(p.price)}</div>
                    <button className="neu-btn neu-btn-accent neu-btn-sm" style={{ width: '100%', marginTop: 8 }}
                      onClick={() => { const wa = `✨ *${p.name}*\n🏷 ${p.code}\n📂 ${(p.categories || [p.category]).join(', ')} · ${(p.sizes || []).join(', ') || p.size}\n💰 ${cur(p.price)}\n🛍 SPLENDORA.COL`; navigator.clipboard?.writeText(wa); alert('¡Copiado!'); }}>
                      📋 Copiar WA
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
        <ProductForm initial={editProd} categories={categories} onSave={async p => { await saveProduct(p, editProd?.id); setShowProd(false); }} />
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
        <BulkForm categories={categories} onSave={async (items) => {
          for (const prod of items) {
            const { data: cnt } = await supabase.from('counters').select('value').eq('id', 'product_code').single();
            const code = genCode(prod.category || prod.productCategories?.[0] || 'Otro', cnt?.value || 1);
            await supabase.from('counters').update({ value: (cnt?.value || 1) + 1 }).eq('id', 'product_code');
            await supabase.from('products').insert({ ...prod, code });
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

function ProductForm({ initial, onSave, categories }) {
  const [f, setF] = useState(initial ? {
    name: initial.name, category: initial.category,
    productCategories: initial.categories || (initial.category ? [initial.category] : []),
    size: initial.size,
    sizes: initial.sizes || [], color: initial.color || '',
    cost_product: initial.cost_product, cost_bag: initial.cost_bag,
    cost_shipping: initial.cost_shipping, price: initial.price, stock: initial.stock,
    description: initial.description, photo_url: initial.photo_url,
    photo_url_2: initial.photo_url_2 || '',
    discount: initial.discount || 0, hide_price: initial.hide_price || false,
  } : {
    name: '', category: 'Blusas', productCategories: [], size: 'M', sizes: [], color: '',
    cost_product: 0, cost_bag: 0, cost_shipping: 0, price: 0, stock: 1,
    description: '', photo_url: '', photo_url_2: '', discount: 0, hide_price: false,
  });

  const [uploading, setUploading] = useState(false);
  const ref1 = useRef(null);
  const ref2 = useRef(null);
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
      {/* TWO PHOTO UPLOADS */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Fotos del producto (máximo 2)</label>
        <div style={{ display: 'flex', gap: 12 }}>
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
      </div>

      <Fld label="Nombre"><input className="neu-input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ej: Blusa floral" /></Fld>

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

      <Fld label="Color"><input className="neu-input" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} placeholder="Negro, Blanco..." /></Fld>

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

      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }}
        onClick={() => {
          if (!f.name) return alert('Nombre requerido');
          if (f.productCategories.length === 0) return alert('Selecciona al menos una categoría');
          onSave({ ...f, cost_total: ct, categories: f.productCategories, category: f.productCategories[0] });
        }}>
        {initial ? 'Guardar cambios' : 'Agregar producto'}
      </button>
    </div>
  );
}

function OrderForm({ products, onSave }) {
  const [f, setF] = useState({ customer_name: '', channel: 'WhatsApp', shipping_charge: 0, items: [] });
  const [sel, setSel] = useState('');
  const [qty, setQty] = useState(1);
  const av = products.filter(p => p.stock > 0);
  const st = f.items.reduce((s, i) => s + i.subtotal, 0);
  const cT = f.items.reduce((s, i) => s + i.costUnit * i.qty, 0);
  const tot = st + Number(f.shipping_charge || 0);

  return (
    <div>
      <Fld label="Clienta"><input className="neu-input" value={f.customer_name} onChange={e => setF({ ...f, customer_name: e.target.value })} placeholder="Nombre o @instagram" /></Fld>
      <Fld label="Canal">
        <select className="neu-select" value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}>
          {['WhatsApp', 'Instagram', 'Facebook', 'Otro'].map(c => <option key={c}>{c}</option>)}
        </select>
      </Fld>
      <div className="label">Productos</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <select className="neu-select" value={sel} onChange={e => setSel(e.target.value)} style={{ flex: 1 }}>
          <option value="">Seleccionar...</option>
          {av.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name} ({p.stock})</option>)}
        </select>
        <input className="neu-input" type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} style={{ width: 50 }} />
        <button className="neu-btn neu-btn-accent" onClick={() => {
          const p = products.find(x => x.id === sel);
          if (!p || f.items.find(i => i.productId === p.id)) return;
          setF({ ...f, items: [...f.items, { productId: p.id, name: p.name, code: p.code, qty, priceUnit: p.price, costUnit: p.cost_total, subtotal: p.price * qty }] });
          setSel(''); setQty(1);
        }} style={{ padding: '10px 14px' }}>+</button>
      </div>
      {f.items.map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E5E7EB' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{it.name} ×{it.qty}</div>
            <div style={{ fontSize: 9, color: '#6B7280' }}>{it.code}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>{cur(it.subtotal)}</span>
            <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} style={{ padding: '2px 6px' }}>✕</button>
          </div>
        </div>
      ))}
      {f.items.length > 0 && <div style={{ height: 12 }} />}
      <Fld label="Envío a clienta"><input className="neu-input" type="number" value={f.shipping_charge} onChange={e => setF({ ...f, shipping_charge: Number(e.target.value) })} /></Fld>
      <div className="neu-card neu-pressed" style={{ padding: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>Total</span>
        <span style={{ fontSize: 17, fontWeight: 800 }}>{cur(tot)}</span>
      </div>
      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }}
        onClick={() => { if (!f.customer_name) return alert('Nombre requerido'); if (!f.items.length) return alert('Agrega productos'); onSave({ ...f, total: tot, cost_total: cT }); }}>
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

function BulkForm({ categories, onSave }) {
  const emptyRow = { name: '', category: categories[0] || 'Otro', productCategories: [], color: '', size: 'M', sizes: [], cost_product: 0, cost_bag: 0, cost_shipping: 0, price: 0, stock: 1, description: '', photo_url: '', photo_url_2: '', discount: 0, hide_price: false };
  const [rows, setRows] = useState([{ ...emptyRow }, { ...emptyRow }, { ...emptyRow }]);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const items = valid.map(r => ({
      ...r,
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

      {rows.map((r, i) => (
        <div key={i} className="neu-card" style={{ padding: 14, marginBottom: 10, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#4A6FA5' }}>Producto {i + 1}</div>
            {rows.length > 1 && (
              <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => removeRow(i)} style={{ padding: '2px 8px', fontSize: 10 }}>✕</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label className="label">Nombre *</label>
              <input className="neu-input" value={r.name} onChange={e => updateRow(i, 'name', e.target.value)} placeholder="Ej: Blusa floral" style={{ fontSize: 12 }} />
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
      ))}

      <button className="neu-btn" style={{ width: '100%', marginBottom: 12 }} onClick={addRow}>
        + Agregar otro producto
      </button>

      <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={handleSave} disabled={saving}>
        {saving ? 'Guardando...' : `📦 Guardar ${rows.filter(r => r.name.trim()).length} producto(s)`}
      </button>
    </div>
  );
}
