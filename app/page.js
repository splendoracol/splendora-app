'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'finances', label: 'Finanzas' },
  { id: 'catalog', label: 'Catálogo' },
  { id: 'tools', label: 'Más' },
];
const CATEGORIES = ["Blusas","Pantalones","Vestidos","Faldas","Conjuntos","Accesorios","Zapatos","Bolsos","Otro"];
const SIZES = ["XS","S","M","L","XL","XXL","Única"];
const STATUS = {
  pending: { label: 'Pendiente', color: '#D4A843' },
  confirmed: { label: 'Confirmado', color: '#4A6FA5' },
  shipped: { label: 'Enviado', color: '#7B9ECF' },
  delivered: { label: 'Entregado', color: '#4A9E6B' },
  cancelled: { label: 'Cancelado', color: '#C0504E' },
};
const cur = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

function genCode(cat, idx) {
  const p = { Blusas:'BL', Pantalones:'PN', Vestidos:'VS', Faldas:'FL', Conjuntos:'CJ', Accesorios:'AC', Zapatos:'ZP', Bolsos:'BO', Otro:'OT' };
  return `SPL-${p[cat]||'SP'}-${String(idx).padStart(4,'0')}`;
}

function buildExcel(products, orders, expenses, config) {
  const e=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const n=v=>`<Cell><Data ss:Type="Number">${v||0}</Data></Cell>`, s=v=>`<Cell><Data ss:Type="String">${e(v)}</Data></Cell>`;
  const done=orders.filter(o=>o.status==='delivered'), rv=done.reduce((a,o)=>a+(o.total||0),0), cs=done.reduce((a,o)=>a+(o.cost_total||0),0), ex=expenses.reduce((a,x)=>a+(x.amount||0),0);
  const bs = config.business_split || 10;
  const net=rv-cs-ex, biz=net*bs/100, distributable=net-biz;
  const s1=distributable*config.split/100, s2=distributable*(100-config.split)/100;
  const mk=(nm,h,rows)=>`<Worksheet ss:Name="${nm}"><Table><Row>${h.map(x=>`<Cell ss:StyleID="h"><Data ss:Type="String">${x}</Data></Cell>`).join('')}</Row>${rows}</Table></Worksheet>`;
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Interior ss:Color="#2D3748" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style></Styles><Worksheet ss:Name="Resumen"><Table><Row><Cell ss:StyleID="h"><Data ss:Type="String">Concepto</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Valor</Data></Cell></Row><Row>${s('Fecha')}${s(new Date().toLocaleDateString('es-CO'))}</Row><Row>${s('Ingresos')}${n(rv)}</Row><Row>${s('Costos')}${n(cs)}</Row><Row>${s('Gastos')}${n(ex)}</Row><Row>${s('Ganancia neta')}${n(net)}</Row><Row>${s('SPLENDORA ('+bs+'%)')}${n(biz)}</Row><Row>${s(config.partner1+' ('+config.split+'%)')}${n(s1)}</Row><Row>${s(config.partner2+' ('+(100-config.split)+'%)')}${n(s2)}</Row></Table></Worksheet>${mk('Inventario',['Código','Nombre','Categoría','Tallas','Color','Costo','Precio','Stock','Descuento'],products.map(p=>`<Row>${s(p.code)}${s(p.name)}${s(p.category)}${s((p.sizes||[]).join(', ')||p.size)}${s(p.color)}${n(p.cost_total)}${n(p.price)}${n(p.stock)}${n(p.discount)}</Row>`).join(''))}${mk('Pedidos',['Fecha','Cliente','Canal','Productos','Total','Costo','Estado'],orders.map(o=>`<Row>${s(new Date(o.created_at).toLocaleDateString('es-CO'))}${s(o.customer_name)}${s(o.channel)}${s((o.items||[]).map(i=>i.name+' x'+i.qty).join(', '))}${n(o.total)}${n(o.cost_total)}${s(STATUS[o.status]?.label||o.status)}</Row>`).join(''))}${mk('Gastos',['Fecha','Descripción','Monto','Pagado por'],expenses.map(x=>`<Row>${s(new Date(x.created_at).toLocaleDateString('es-CO'))}${s(x.description)}${n(x.amount)}${s(x.paid_by)}</Row>`).join(''))}</Workbook>`;
}
function dlExcel(p,o,e,c) { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buildExcel(p,o,e,c)],{type:'application/vnd.ms-excel'})); a.download=`SPLENDORA_${new Date().toISOString().slice(0,10)}.xls`; a.click(); }

async function uploadPhoto(file) {
  const name = `${Date.now()}.${file.name.split('.').pop()}`;
  const { error } = await supabase.storage.from('product-photos').upload(name, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return supabase.storage.from('product-photos').getPublicUrl(name).data.publicUrl;
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return <div className="modal-overlay" onClick={onClose}><div className={`modal-content ${wide?'modal-wide':''}`} onClick={e=>e.stopPropagation()}>
    <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#F0F2F5', zIndex: 1, borderRadius: '20px 20px 0 0' }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
      <button className="neu-btn neu-btn-sm" onClick={onClose} style={{ width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
    </div>
    <div style={{ padding: '0 22px 22px' }}>{children}</div>
  </div></div>;
}
function Fld({ label, children }) { return <div style={{ marginBottom: 16 }}><label className="label">{label}</label>{children}</div>; }
function Thumb({ src, size = 46 }) { return <div style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--pressed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: size*0.35, color: '#9CA3AF' }}>+</span>}</div>; }

export default function HomePage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [config, setConfig] = useState({ partner1: 'DahiannaGs', partner2: 'Estelasuarez', split: 50, business_split: 10 });
  const [catCfg, setCatCfg] = useState({ banner_text: '', banner_image: '', banner_active: false, instagram_url: '', whatsapp_number: '' });
  const [showProd, setShowProd] = useState(false);
  const [editProd, setEditProd] = useState(null);
  const [showOrd, setShowOrd] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [showCatCfg, setShowCatCfg] = useState(false);
  const [catFilter, setCatFilter] = useState('Todas');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); if (!session) window.location.href = '/login'; else loadAll(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) window.location.href = '/login'; });
    return () => subscription.unsubscribe();
  }, []);

  async function loadAll() {
    const [{ data: p }, { data: o }, { data: e }, { data: c }, { data: cc }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('config').select('*').eq('id', 1).single(),
      supabase.from('catalog_config').select('*').eq('id', 1).single(),
    ]);
    setProducts(p || []); setOrders(o || []); setExpenses(e || []); if (c) setConfig(c); if (cc) setCatCfg(cc); setLoading(false);
  }

  async function saveProduct(prod, editId) {
    if (editId) { await supabase.from('products').update(prod).eq('id', editId); }
    else {
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
      for (const it of (items || [])) { const p = products.find(x => x.id === it.productId); if (p) await supabase.from('products').update({ stock: Math.max(0, p.stock - it.qty) }).eq('id', p.id); }
    }
    loadAll();
  }
  async function saveExpense(exp) { await supabase.from('expenses').insert(exp); loadAll(); }
  async function deleteExpense(id) { await supabase.from('expenses').delete().eq('id', id); loadAll(); }
  async function saveConfig(cfg) { await supabase.from('config').update(cfg).eq('id', 1); setConfig(cfg); setShowCfg(false); }
  async function saveCatCfg(cc) { await supabase.from('catalog_config').update(cc).eq('id', 1); setCatCfg(cc); setShowCatCfg(false); }

  const m = useMemo(() => {
    const ic = products.reduce((s,p) => s + (p.cost_total||0) * (p.stock||0), 0);
    const ir = products.reduce((s,p) => s + (p.price||0) * (p.stock||0), 0);
    const dn = orders.filter(o => o.status === 'delivered');
    const rv = dn.reduce((s,o) => s + (o.total||0), 0), cs = dn.reduce((s,o) => s + (o.cost_total||0), 0);
    const ex = expenses.reduce((s,e) => s + (e.amount||0), 0), nt = rv - cs - ex;
    const bs = config.business_split || 10;
    const biz = nt * bs / 100, dist = nt - biz;
    const s1 = dist * config.split / 100, s2 = dist * (100 - config.split) / 100;
    return { ic, ir, dn, rv, cs, ex, nt, biz, s1, s2, bs, low: products.filter(p=>p.stock>0&&p.stock<=2), out: products.filter(p=>p.stock===0), pnd: orders.filter(o=>o.status==='pending'||o.status==='confirmed') };
  }, [products, orders, expenses, config]);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5', fontFamily: "'Montserrat'" }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div><div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 3, marginTop: 4 }}>CARGANDO...</div></div></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: "'Montserrat', sans-serif", color: '#1A1D23', paddingBottom: 78 }}>
      {/* HEADER */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2 }}>SPLENDORA</div><div style={{ fontSize: 8, color: '#9CA3AF', letterSpacing: 3, marginTop: -1 }}>C O L</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="neu-btn neu-btn-sm" onClick={() => setShowCfg(true)}>⚙</button>
          <button className="neu-btn neu-btn-sm" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}>Salir</button>
        </div>
      </div>

      <div style={{ padding: '0 14px' }}>

        {/* DASHBOARD */}
        {tab === 'dashboard' && <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
            {[
              { l: 'Productos', v: products.length, s: `${m.out.length} agotados` },
              { l: 'Pedidos pend.', v: m.pnd.length, s: `${m.dn.length} entregados`, c: '#4A6FA5' },
              { l: 'Inversión', v: cur(m.ic), s: `Valor: ${cur(m.ir)}`, c: '#4A6FA5' },
              { l: 'Ganancia', v: cur(m.nt), s: `Negocio: ${cur(m.biz)}`, c: m.nt >= 0 ? '#4A9E6B' : '#C0504E' },
            ].map((x,i) => <div key={i} className="neu-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 7 }}>{x.l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: x.c || '#1A1D23' }}>{x.v}</div>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>{x.s}</div>
            </div>)}
          </div>

          {/* Triple split */}
          <div className="neu-card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>División de ganancias</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { n: 'SPLENDORA', p: m.bs, v: m.biz, c: '#4A6FA5' },
                { n: config.partner1, p: config.split, v: m.s1, c: '#1A1D23' },
                { n: config.partner2, p: 100 - config.split, v: m.s2, c: '#1A1D23' },
              ].map((x,i) => <div key={i} className="neu-card neu-pressed" style={{ flex: 1, textAlign: 'center', padding: 10 }}>
                <div style={{ fontSize: 8, color: '#6B7280' }}>{x.n} ({x.p}%)</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: x.c }}>{cur(x.v)}</div>
              </div>)}
            </div>
            <div style={{ fontSize: 8, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>Del {m.bs}% del negocio se pagan envíos y reinversión. El resto se divide entre socias.</div>
          </div>

          {(m.low.length > 0 || m.out.length > 0) && <div className="neu-card" style={{ marginTop: 14, padding: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#D4A843', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>⚠ Stock bajo</div>
            {m.out.map(p => <div key={p.id} style={{ fontSize: 11, color: '#C0504E', marginBottom: 3 }}><b>{p.code}</b> {p.name} — Agotado</div>)}
            {m.low.map(p => <div key={p.id} style={{ fontSize: 11, color: '#D4A843', marginBottom: 3 }}><b>{p.code}</b> {p.name} — {p.stock}</div>)}
          </div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="neu-btn neu-btn-accent" style={{ flex: 1 }} onClick={() => { setEditProd(null); setShowProd(true); }}>+ Producto</button>
            <button className="neu-btn" style={{ flex: 1 }} onClick={() => setShowOrd(true)}>+ Pedido</button>
          </div>
        </div>}

        {/* INVENTORY */}
        {tab === 'inventory' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Inventario</h2>
            <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={() => { setEditProd(null); setShowProd(true); }}>+ Nuevo</button>
          </div>
          <div className="neu-card neu-pressed" style={{ padding: 0, marginBottom: 12 }}><input className="neu-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ boxShadow: 'none', background: 'transparent' }} /></div>
          {products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code||'').toLowerCase().includes(search.toLowerCase())).map(p => (
            <div key={p.id} className="neu-card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <Thumb src={p.photo_url} size={50} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#4A6FA5', boxShadow: 'var(--pressed)', padding: '2px 7px', borderRadius: 6 }}>{p.code}</span>
                  {p.discount > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#C0504E', background: '#FEE2E2', padding: '1px 5px', borderRadius: 4 }}>-{p.discount}%</span>}
                  {p.hide_price && <span style={{ fontSize: 8, fontWeight: 700, color: '#6B7280', background: '#E5E7EB', padding: '1px 5px', borderRadius: 4 }}>Precio oculto</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#6B7280' }}>{p.category} · {(p.sizes||[]).join(', ') || p.size}{p.color ? ` · ${p.color}` : ''} · {cur(p.price)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <div className="neu-card neu-pressed" style={{ padding: '3px 10px', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: p.stock === 0 ? '#C0504E' : p.stock <= 2 ? '#D4A843' : '#4A9E6B' }}>{p.stock}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="neu-btn neu-btn-sm" onClick={() => { setEditProd(p); setShowProd(true); }} style={{ padding: '3px 7px' }}>✎</button>
                  <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => { if(confirm('¿Eliminar?')) deleteProduct(p.id); }} style={{ padding: '3px 7px' }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>}

        {/* ORDERS */}
        {tab === 'orders' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Pedidos</h2>
            <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={() => setShowOrd(true)}>+ Nuevo</button>
          </div>
          {orders.map(o => (
            <div key={o.id} className="neu-card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{o.customer_name}</div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{(o.items||[]).map(i => `${i.name} ×${i.qty}`).join(', ')}</div>
                  <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>{o.channel} · {new Date(o.created_at).toLocaleDateString('es-CO')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{cur(o.total)}</div>
                  <span className="neu-pressed" style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, marginTop: 3, fontSize: 9, fontWeight: 700, color: STATUS[o.status]?.color }}>{STATUS[o.status]?.label}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                {Object.entries(STATUS).filter(([k]) => k !== 'cancelled').map(([k,v]) =>
                  <button key={k} className="neu-btn neu-btn-sm" onClick={() => updateOrderStatus(o.id, k, o.items, o.status)}
                    style={{ padding: '4px 9px', fontSize: 9, ...(o.status === k ? { boxShadow: 'var(--pressed)', color: v.color, fontWeight: 800 } : {}) }}>{v.label}</button>
                )}
                <button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => updateOrderStatus(o.id, 'cancelled', o.items, o.status)} style={{ padding: '4px 9px', fontSize: 9, marginLeft: 'auto' }}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>}

        {/* FINANCES */}
        {tab === 'finances' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Finanzas</h2>
            <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={() => setShowExp(true)}>+ Gasto</button>
          </div>
          <div className="neu-card" style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[{l:'Ingresos',v:m.rv,c:'#4A9E6B'},{l:'Costos',v:m.cs},{l:'Gastos',v:m.ex,c:'#D4A843'},{l:'Ganancia neta',v:m.nt,c:m.nt>=0?'#4A9E6B':'#C0504E'}].map((r,i) =>
                <div key={i} className="neu-card neu-pressed" style={{ padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>{r.l}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: r.c || '#1A1D23' }}>{cur(r.v)}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {[
                { n: 'SPLENDORA', p: m.bs, v: m.biz, c: '#4A6FA5' },
                { n: config.partner1, p: config.split, v: m.s1 },
                { n: config.partner2, p: 100 - config.split, v: m.s2 },
              ].map((x,i) => <div key={i} className="neu-card" style={{ flex: 1, textAlign: 'center', padding: 10 }}>
                <div style={{ fontSize: 8, color: '#6B7280' }}>{x.n} ({x.p}%)</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3, color: x.c || '#4A6FA5' }}>{cur(x.v)}</div>
              </div>)}
            </div>
            <div style={{ fontSize: 8, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
              Primero se separa {m.bs}% para SPLENDORA (envíos, reinversión). El resto ({100-m.bs}%) se divide entre socias.
            </div>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Gastos</div>
          {expenses.map(e => <div key={e.id} className="neu-card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div><div style={{ fontWeight: 600, fontSize: 12 }}>{e.description}</div><div style={{ fontSize: 9, color: '#6B7280' }}>{new Date(e.created_at).toLocaleDateString('es-CO')} · {e.paid_by}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 700 }}>{cur(e.amount)}</span><button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => deleteExpense(e.id)} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button></div>
          </div>)}
        </div>}

        {/* CATALOG */}
        {tab === 'catalog' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Catálogo</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="neu-btn neu-btn-sm" onClick={() => setShowCatCfg(true)}>🎨 Config</button>
              <a href="/catalogo" target="_blank" className="neu-btn neu-btn-accent neu-btn-sm" style={{ textDecoration: 'none' }}>🌐 Ver público</a>
            </div>
          </div>
          <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 12 }}>Configura banner y promociones. "Ver público" abre lo que ven tus clientas.</p>

          {/* Banner preview */}
          {catCfg.banner_active && (catCfg.banner_text || catCfg.banner_image) && (
            <div className="neu-card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#4A6FA5', marginBottom: 6 }}>BANNER ACTIVO</div>
              {catCfg.banner_image && <img src={catCfg.banner_image} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />}
              {catCfg.banner_text && <div style={{ fontSize: 12, fontWeight: 600 }}>{catCfg.banner_text}</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {['Todas',...CATEGORIES].map(c => <button key={c} className="neu-btn neu-btn-sm" onClick={() => setCatFilter(c)} style={{ whiteSpace: 'nowrap', fontSize: 10, ...(catFilter===c?{boxShadow:'var(--pressed)',color:'#4A6FA5',fontWeight:800}:{}) }}>{c}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {products.filter(p => p.stock > 0 && (catFilter === 'Todas' || p.category === catFilter)).map(p => {
              const wa = `✨ *${p.name}*\n🏷 ${p.code}\n📂 ${p.category} · ${(p.sizes||[]).join(', ')||p.size}\n💰 ${cur(p.price)}\n🛍 SPLENDORA.COL`;
              return <div key={p.id} className="neu-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 120, boxShadow: 'var(--pressed)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: 7, borderRadius: 10 }}>
                  {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ fontSize: 30, color: '#9CA3AF' }}>+</span>}
                </div>
                <div style={{ padding: '6px 12px 12px' }}>
                  <div style={{ fontSize: 8, color: '#4A6FA5', fontWeight: 700 }}>{p.code}</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{p.name}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{cur(p.price)}</div>
                  <button className="neu-btn neu-btn-accent neu-btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(wa); alert('¡Copiado!'); }}>📋 Copiar WA</button>
                </div>
              </div>;
            })}
          </div>
        </div>}

        {/* TOOLS */}
        {tab === 'tools' && <div>
          <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800 }}>Herramientas</h2>
          <div className="neu-card" style={{ marginBottom: 12 }}>
            <div className="label">Respaldo Excel</div>
            <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => dlExcel(products, orders, expenses, config)}>⬇ Descargar Excel</button>
          </div>
          <div className="neu-card" style={{ marginBottom: 12 }}>
            <div className="label">Catálogo público</div>
            <div className="neu-card neu-pressed" style={{ padding: 10, fontSize: 12, fontWeight: 600, wordBreak: 'break-all', marginBottom: 8 }}>{typeof window !== 'undefined' ? `${window.location.origin}/catalogo` : '/catalogo'}</div>
            <button className="neu-btn" style={{ width: '100%' }} onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/catalogo`); alert('¡Link copiado!'); }}>📋 Copiar link</button>
          </div>
        </div>}
      </div>

      {/* MODALS */}
      <Modal open={showProd} onClose={() => setShowProd(false)} title={editProd ? 'Editar producto' : 'Nuevo producto'}>
        <ProductForm initial={editProd} onSave={async p => { await saveProduct(p, editProd?.id); setShowProd(false); }} />
      </Modal>
      <Modal open={showOrd} onClose={() => setShowOrd(false)} title="Nuevo pedido" wide>
        <OrderForm products={products} onSave={async o => { await saveOrder(o); setShowOrd(false); }} />
      </Modal>
      <Modal open={showExp} onClose={() => setShowExp(false)} title="Registrar gasto">
        <ExpenseForm config={config} onSave={async e => { await saveExpense(e); setShowExp(false); }} />
      </Modal>
      <Modal open={showCfg} onClose={() => setShowCfg(false)} title="Configuración">
        <ConfigForm config={config} onSave={saveConfig} />
      </Modal>
      <Modal open={showCatCfg} onClose={() => setShowCatCfg(false)} title="Configurar catálogo">
        <CatalogConfigForm cfg={catCfg} onSave={saveCatCfg} />
      </Modal>

      {/* NAV */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#F0F2F5', padding: '6px 10px max(6px, env(safe-area-inset-bottom))', zIndex: 999 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', borderRadius: 16, boxShadow: 'var(--raised)', padding: '5px 2px' }}>
          {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5px 8px', borderRadius: 12, boxShadow: tab===t.id?'var(--pressed)':'none', color: tab===t.id?'#4A6FA5':'#9CA3AF', fontFamily: "'Montserrat'" }}><span style={{ fontSize: 9, fontWeight: tab===t.id?800:500 }}>{t.label}</span></button>)}
        </div>
      </div>
    </div>
  );
}

// ═══ PRODUCT FORM ═══
function ProductForm({ initial, onSave }) {
  const [f, setF] = useState(initial ? {
    name: initial.name, category: initial.category, size: initial.size, sizes: initial.sizes || [],
    color: initial.color || '', cost_product: initial.cost_product, cost_bag: initial.cost_bag,
    cost_shipping: initial.cost_shipping, price: initial.price, stock: initial.stock,
    description: initial.description, photo_url: initial.photo_url, discount: initial.discount || 0,
    hide_price: initial.hide_price || false,
  } : { name:'', category:'Blusas', size:'M', sizes:[], color:'', cost_product:0, cost_bag:0, cost_shipping:0, price:0, stock:1, description:'', photo_url:'', discount:0, hide_price:false });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const ct = (Number(f.cost_product)||0) + (Number(f.cost_bag)||0) + (Number(f.cost_shipping)||0);
  const mg = f.price > 0 ? ((f.price - ct) / f.price * 100).toFixed(1) : 0;

  const toggleSize = (s) => {
    setF(prev => ({ ...prev, sizes: prev.sizes.includes(s) ? prev.sizes.filter(x => x !== s) : [...prev.sizes, s] }));
  };

  return <div>
    <div style={{ marginBottom: 16 }}>
      <label className="label">Foto</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div onClick={() => fileRef.current?.click()} style={{ width: 90, height: 90, borderRadius: 14, boxShadow: f.photo_url ? 'var(--raised-sm)' : 'var(--pressed)', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {f.photo_url ? <img src={f.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', color: '#9CA3AF' }}><div style={{ fontSize: 22 }}>📷</div><div style={{ fontSize: 8 }}>{uploading ? 'Subiendo...' : 'SUBIR'}</div></div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { setF({...f, photo_url: await uploadPhoto(file)}); } catch(err) { alert('Error: '+err.message); } setUploading(false); }} />
        {f.photo_url && <button className="neu-btn neu-btn-sm" onClick={() => setF({...f, photo_url:''})}>Quitar</button>}
      </div>
    </div>
    <Fld label="Nombre"><input className="neu-input" value={f.name} onChange={e => setF({...f, name: e.target.value})} placeholder="Ej: Blusa floral" /></Fld>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Fld label="Categoría"><select className="neu-select" value={f.category} onChange={e => setF({...f, category: e.target.value})}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Fld>
      <Fld label="Color"><input className="neu-input" value={f.color} onChange={e => setF({...f, color: e.target.value})} placeholder="Negro, Blanco..." /></Fld>
    </div>

    {/* Multiple sizes */}
    <div style={{ marginBottom: 16 }}>
      <label className="label">Tallas disponibles (selecciona varias)</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SIZES.map(s => <button key={s} type="button" className="neu-btn neu-btn-sm" onClick={() => toggleSize(s)} style={{
          padding: '6px 14px', ...(f.sizes.includes(s) ? { background: '#4A6FA5', color: '#FFF', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.2)' } : {})
        }}>{s}</button>)}
      </div>
      {f.sizes.length === 0 && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6 }}>Si no seleccionas ninguna, se usa la talla única: {f.size}</div>}
    </div>

    <div className="label" style={{ marginTop: 4 }}>Costos</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <Fld label="Producto $"><input className="neu-input" type="number" value={f.cost_product} onChange={e => setF({...f, cost_product: Number(e.target.value)})} /></Fld>
      <Fld label="Bolsa $"><input className="neu-input" type="number" value={f.cost_bag} onChange={e => setF({...f, cost_bag: Number(e.target.value)})} /></Fld>
      <Fld label="Envío $"><input className="neu-input" type="number" value={f.cost_shipping} onChange={e => setF({...f, cost_shipping: Number(e.target.value)})} /></Fld>
    </div>
    <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 10, marginBottom: 14 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Costo total: {cur(ct)}</span></div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Fld label="Precio venta"><input className="neu-input" type="number" value={f.price} onChange={e => setF({...f, price: Number(e.target.value)})} /></Fld>
      <Fld label="Stock"><input className="neu-input" type="number" value={f.stock} onChange={e => setF({...f, stock: Number(e.target.value)})} /></Fld>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Fld label="Descuento %"><input className="neu-input" type="number" min="0" max="99" value={f.discount} onChange={e => setF({...f, discount: Number(e.target.value)})} /></Fld>
      <Fld label="¿Ocultar precio?">
        <button type="button" className="neu-btn" style={{ width: '100%', ...(f.hide_price ? { background: '#4A6FA5', color: '#FFF' } : {}) }} onClick={() => setF({...f, hide_price: !f.hide_price})}>
          {f.hide_price ? 'Sí — Oculto' : 'No — Visible'}
        </button>
      </Fld>
    </div>

    {f.price > 0 && <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 8, marginBottom: 14 }}><span style={{ fontSize: 11, fontWeight: 700, color: Number(mg) >= 30 ? '#4A9E6B' : '#D4A843' }}>Margen: {mg}% · {cur(f.price - ct)}/u</span></div>}
    <Fld label="Descripción (opc.)"><input className="neu-input" value={f.description} onChange={e => setF({...f, description: e.target.value})} placeholder="Material, detalles..." /></Fld>
    <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => { if (!f.name) return alert('Nombre requerido'); onSave({ ...f, cost_total: ct }); }}>{initial ? 'Guardar' : 'Agregar producto'}</button>
  </div>;
}

// ═══ ORDER FORM ═══
function OrderForm({ products, onSave }) {
  const [f, setF] = useState({ customer_name: '', channel: 'WhatsApp', shipping_charge: 0, items: [] });
  const [sel, setSel] = useState(''); const [qty, setQty] = useState(1);
  const av = products.filter(p => p.stock > 0);
  const st = f.items.reduce((s,i) => s + i.subtotal, 0), cT = f.items.reduce((s,i) => s + i.costUnit * i.qty, 0), tot = st + Number(f.shipping_charge || 0);
  return <div>
    <Fld label="Clienta"><input className="neu-input" value={f.customer_name} onChange={e => setF({...f, customer_name: e.target.value})} placeholder="Nombre o @instagram" /></Fld>
    <Fld label="Canal"><select className="neu-select" value={f.channel} onChange={e => setF({...f, channel: e.target.value})}>{['WhatsApp','Instagram','Facebook','Otro'].map(c => <option key={c}>{c}</option>)}</select></Fld>
    <div className="label">Productos</div>
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      <select className="neu-select" value={sel} onChange={e => setSel(e.target.value)} style={{ flex: 1 }}><option value="">Seleccionar...</option>{av.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name} ({p.stock})</option>)}</select>
      <input className="neu-input" type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} style={{ width: 50 }} />
      <button className="neu-btn neu-btn-accent" onClick={() => {
        const p = products.find(x => x.id === sel); if (!p || f.items.find(i => i.productId === p.id)) return;
        setF({...f, items: [...f.items, { productId: p.id, name: p.name, code: p.code, qty, priceUnit: p.price, costUnit: p.cost_total, subtotal: p.price * qty }]}); setSel(''); setQty(1);
      }} style={{ padding: '10px 14px' }}>+</button>
    </div>
    {f.items.map((it,i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E5E7EB' }}>
      <div><div style={{ fontSize: 12, fontWeight: 600 }}>{it.name} ×{it.qty}</div><div style={{ fontSize: 9, color: '#6B7280' }}>{it.code}</div></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 700 }}>{cur(it.subtotal)}</span><button className="neu-btn neu-btn-sm neu-btn-danger" onClick={() => setF({...f, items: f.items.filter((_,j) => j!==i)})} style={{ padding: '2px 6px' }}>✕</button></div>
    </div>)}
    {f.items.length > 0 && <div style={{ height: 12 }} />}
    <Fld label="Envío a clienta"><input className="neu-input" type="number" value={f.shipping_charge} onChange={e => setF({...f, shipping_charge: Number(e.target.value)})} /></Fld>
    <div className="neu-card neu-pressed" style={{ padding: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Total</span><span style={{ fontSize: 17, fontWeight: 800 }}>{cur(tot)}</span></div>
    <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => { if (!f.customer_name) return alert('Nombre requerido'); if (!f.items.length) return alert('Agrega productos'); onSave({ ...f, total: tot, cost_total: cT }); }}>Crear pedido</button>
  </div>;
}

function ExpenseForm({ config, onSave }) {
  const [f, setF] = useState({ description: '', amount: 0, paid_by: config.partner1 });
  return <div>
    <Fld label="Descripción"><input className="neu-input" value={f.description} onChange={e => setF({...f, description: e.target.value})} placeholder="Envío, publicidad..." /></Fld>
    <Fld label="Monto"><input className="neu-input" type="number" value={f.amount} onChange={e => setF({...f, amount: Number(e.target.value)})} /></Fld>
    <Fld label="¿Quién pagó?"><select className="neu-select" value={f.paid_by} onChange={e => setF({...f, paid_by: e.target.value})}><option>{config.partner1}</option><option>{config.partner2}</option><option>SPLENDORA (negocio)</option></select></Fld>
    <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => { if (!f.description || !f.amount) return alert('Completa campos'); onSave(f); }}>Registrar</button>
  </div>;
}

function ConfigForm({ config, onSave }) {
  const [c, setC] = useState(config);
  return <div>
    <Fld label="Socia 1"><input className="neu-input" value={c.partner1} onChange={e => setC({...c, partner1: e.target.value})} /></Fld>
    <Fld label="Socia 2"><input className="neu-input" value={c.partner2} onChange={e => setC({...c, partner2: e.target.value})} /></Fld>
    <Fld label={`% para SPLENDORA (negocio): ${c.business_split}%`}>
      <input type="range" min="0" max="30" value={c.business_split || 10} onChange={e => setC({...c, business_split: Number(e.target.value)})} style={{ width: '100%', accentColor: '#4A6FA5' }} />
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4, textAlign: 'center' }}>Este % se separa para envíos, publicidad y reinversión del negocio</div>
    </Fld>
    <Fld label={`División entre socias: ${c.split}% / ${100-c.split}%`}>
      <input type="range" min="0" max="100" value={c.split} onChange={e => setC({...c, split: Number(e.target.value)})} style={{ width: '100%', accentColor: '#4A6FA5' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginTop: 4 }}><span>{c.partner1}: {c.split}%</span><span>{c.partner2}: {100-c.split}%</span></div>
    </Fld>
    <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => onSave(c)}>Guardar</button>
  </div>;
}

function CatalogConfigForm({ cfg, onSave }) {
  const [c, setC] = useState(cfg);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  return <div>
    <Fld label="Banner activo">
      <button type="button" className="neu-btn" style={{ width: '100%', ...(c.banner_active ? { background: '#4A6FA5', color: '#FFF' } : {}) }} onClick={() => setC({...c, banner_active: !c.banner_active})}>
        {c.banner_active ? 'Sí — Visible en catálogo' : 'No — Oculto'}
      </button>
    </Fld>
    <Fld label="Texto del banner (promoción, fecha especial)">
      <input className="neu-input" value={c.banner_text} onChange={e => setC({...c, banner_text: e.target.value})} placeholder="Ej: 🔥 20% OFF en toda la colección" />
    </Fld>
    <div style={{ marginBottom: 16 }}>
      <label className="label">Imagen del banner (opcional)</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div onClick={() => fileRef.current?.click()} style={{ width: 120, height: 60, borderRadius: 10, boxShadow: c.banner_image ? 'var(--raised-sm)' : 'var(--pressed)', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {c.banner_image ? <img src={c.banner_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 10 }}>{uploading ? 'Subiendo...' : '+ Imagen'}</div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return; setUploading(true);
          try { setC({...c, banner_image: await uploadPhoto(file)}); } catch(err) { alert('Error: '+err.message); }
          setUploading(false);
        }} />
        {c.banner_image && <button className="neu-btn neu-btn-sm" onClick={() => setC({...c, banner_image: ''})}>Quitar</button>}
      </div>
    </div>
    <Fld label="Instagram URL"><input className="neu-input" value={c.instagram_url} onChange={e => setC({...c, instagram_url: e.target.value})} /></Fld>
    <Fld label="WhatsApp (con código país, sin +)"><input className="neu-input" value={c.whatsapp_number} onChange={e => setC({...c, whatsapp_number: e.target.value})} placeholder="573172346822" /></Fld>
    <button className="neu-btn neu-btn-accent" style={{ width: '100%' }} onClick={() => onSave(c)}>Guardar configuración</button>
  </div>;
}
