'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'finances', label: 'Finanzas' },
  { id: 'catalog', label: 'Catálogo' },
  { id: 'customers', label: 'Clientes' },
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

// Mapa de colores pastel — detecta automáticamente el hex según el nombre
const COLOR_MAP = {
  'negro': '#4A4A4A',
  'blanco': '#FAFAFA',
  'rojo': '#F5A3A3',
  'rojo pastel': '#F5A3A3',
  'azul': '#A8C8E8',
  'azul pastel': '#A8C8E8',
  'celeste': '#BEDFF0',
  'rosa': '#F4C2D7',
  'rosa pastel': '#F4C2D7',
  'rosado': '#F4C2D7',
  'fucsia': '#E8A5C0',
  'verde': '#B5D9B5',
  'verde pastel': '#B5D9B5',
  'menta': '#B8E0D2',
  'amarillo': '#F8E5A1',
  'amarillo pastel': '#F8E5A1',
  'mostaza': '#E8D078',
  'cafe': '#C9A98E',
  'café': '#C9A98E',
  'marron': '#B89272',
  'marrón': '#B89272',
  'beige': '#F0E4D0',
  'crema': '#F4ECDD',
  'gris': '#C8C8C8',
  'gris perla': '#D8D8D8',
  'morado': '#C9B0E0',
  'lila': '#D5BEE0',
  'lavanda': '#D5C5E8',
  'violeta': '#C5B0DC',
  'naranja': '#F5C8A8',
  'durazno': '#F8C8B0',
  'salmon': '#F5B8A8',
  'salmón': '#F5B8A8',
  'coral': '#F5B5A8',
  'vinotinto': '#9B4A4A',
  'vino': '#9B4A4A',
  'dorado': '#E0C896',
  'champagne': '#E8D5B0',
  'plata': '#D0D0D0',
  'plateado': '#D0D0D0',
  'turquesa': '#B5DFD8',
  'aqua': '#B5DFD8',
  'oliva': '#B8B58A',
  'caqui': '#D0C29B',
  'nude': '#E8D0BC',
  'perla': '#F0EBE0',
  'tierra': '#C8AC8A',
};

function getColorHex(name) {
  if (!name) return '#E5E7EB';
  const normalized = String(name).trim().toLowerCase();
  if (COLOR_MAP[normalized]) return COLOR_MAP[normalized];
  // Buscar palabra clave dentro del nombre
  for (const key of Object.keys(COLOR_MAP)) {
    if (normalized.includes(key)) return COLOR_MAP[key];
  }
  return '#E5E7EB'; // Color por defecto si no se reconoce
}

// Componente bolita de color
function ColorDot({ name, size = 14 }) {
  const hex = getColorHex(name);
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: hex, border: '1px solid rgba(0,0,0,0.15)', verticalAlign: 'middle',
      flexShrink: 0,
    }} />
  );
}

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
  // Distribución según modelo SPLENDORA documento oficial:
  // 20% Ads + 10% Marca + 35% socia 1 + 35% socia 2
  // Los gastos se descuentan: primero del 10% Marca, luego del 20% Ads, luego de socias 50/50
  const gross = rv - cs;
  const adsBase = Math.max(0, gross * 0.20);
  const brandBase = Math.max(0, gross * 0.10);
  const socBase = Math.max(0, gross * 0.35);
  let ads, brand, s1, s2;
  let remEx = ex;
  if (remEx <= brandBase) { brand = brandBase - remEx; remEx = 0; }
  else { brand = 0; remEx -= brandBase; }
  if (remEx <= adsBase) { ads = adsBase - remEx; remEx = 0; }
  else { ads = 0; remEx -= adsBase; }
  const sociaDeficit = remEx / 2;
  s1 = socBase - sociaDeficit;
  s2 = socBase - sociaDeficit;
  const bizTotal = ads + brand;
  const mk = (nm, h, rows) => `<Worksheet ss:Name="${nm}"><Table><Row>${h.map(x => `<Cell ss:StyleID="h"><Data ss:Type="String">${x}</Data></Cell>`).join('')}</Row>${rows}</Table></Worksheet>`;
  const period = month !== null ? `${MONTHS[month]} ${year}` : 'Todo';
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Interior ss:Color="#2D3748" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style></Styles><Worksheet ss:Name="Resumen"><Table><Row><Cell ss:StyleID="h"><Data ss:Type="String">Concepto</Data></Cell><Cell ss:StyleID="h"><Data ss:Type="String">Valor</Data></Cell></Row><Row>${s('Periodo')}${s(period)}</Row><Row>${s('Ingresos (ventas)')}${n(rv)}</Row><Row>${s('Cobrado')}${n(cashReceived)}</Row><Row>${s('Por cobrar')}${n(pc)}</Row><Row>${s('Costos (productos vendidos)')}${n(cs)}</Row><Row>${s('Gastos')}${n(ex)}</Row><Row>${s('Ganancia neta')}${n(nt)}</Row><Row>${s('Reserva Ads (20%)')}${n(ads)}</Row><Row>${s('Reserva Marca (10%)')}${n(brand)}</Row><Row>${s('SPLENDORA total (Ads + Marca)')}${n(bizTotal)}</Row><Row>${s(config.partner1 + ' (35%)')}${n(s1)}</Row><Row>${s(config.partner2 + ' (35%)')}${n(s2)}</Row></Table></Worksheet>${mk('Inventario', ['Código', 'Nombre', 'Categoría', 'Tallas', 'Color', 'Costo u.', 'Precio u.', 'Stock', 'Inversión (costo×stock)', 'Valor venta (precio×stock)', 'Ganancia proy. (×stock)', 'Descuento %'], products.map(p => { const inv = (p.cost_total || 0) * (p.stock || 0); const val = (p.price || 0) * (p.stock || 0); const gp = ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0); return `<Row>${s(p.code)}${s(p.name)}${s((p.categories || [p.category]).join(', '))}${s((p.sizes || []).join(', ') || p.size)}${s((p.colors || [p.color]).filter(Boolean).join(', '))}${n(p.cost_total)}${n(p.price)}${n(p.stock)}${n(inv)}${n(val)}${n(gp)}${n(p.discount)}</Row>`; }).join(''))}${mk('Pedidos', ['Fecha', 'Cliente', 'Ciudad', 'Canal', 'Productos', 'Total', 'Costo', 'Estado entrega', 'Estado pago', 'Abonado', 'Por cobrar', 'Notas pago'], fo.map(o => { const due = Math.max(0, (o.total || 0) - (o.amount_paid || 0)); const ps = o.payment_status || 'pending'; return `<Row>${s(new Date(o.created_at).toLocaleDateString('es-CO'))}${s(o.customer_name)}${s(o.city || '')}${s(o.channel)}${s((o.items || []).map(i => `${i.name} x${i.qty}${i.size ? ` (T:${i.size})` : ''}${i.color ? ` (${i.color})` : ''}`).join(', '))}${n(o.total)}${n(o.cost_total)}${s(STATUS[o.status]?.label || o.status)}${s(PAYMENT_STATUS[ps]?.label || ps)}${n(o.amount_paid)}${n(ps === 'paid' ? 0 : due)}${s(o.payment_notes || '')}</Row>`; }).join(''))}${mk('Gastos', ['Fecha', 'Descripción', 'Monto', 'Pagado por'], fe.map(x => `<Row>${s(new Date(x.created_at).toLocaleDateString('es-CO'))}${s(x.description)}${n(x.amount)}${s(x.paid_by)}</Row>`).join(''))}</Workbook>`;
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
  const [tab, setTabState] = useState('dashboard');
  const setTab = (t) => {
    setTabState(t);
    try { localStorage.setItem('active_tab', t); } catch {}
  };
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [config, setConfig] = useState({ partner1: 'DahiannaGs', partner2: 'Estelasuarez', split: 50, business_split: 10 });
  const [catCfg, setCatCfg] = useState({ banner_text: '', banner_image: '', banner_active: false, instagram_url: '', whatsapp_number: '', logo_url: '', share_image_url: '' });
  const [editorialCfg, setEditorialCfg] = useState({ enabled: false, quote_text: '', photos: [], cta_text: 'Ver más', cta_type: 'none', cta_value: '', gallery_enabled: false, gallery_word: '', gallery_subtitle: '', gallery_cta_text: 'Ver más', gallery_cta_type: 'none', gallery_cta_value: '', gallery_photos: [] });
  const [showEditorial, setShowEditorial] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
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
  // Colapsables de tablas
  const [tblSection, setTblSection] = useState(true);
  const [tblPedidos, setTblPedidos] = useState(true);
  const [tblInventario, setTblInventario] = useState(false);
  const [tblInvFilter, setTblInvFilter] = useState('active'); // 'active', 'archived', 'all'
  // Filtro de estados de pago para la tabla de pedidos. Por defecto, los 3 activos.
  const [tblPayFilter, setTblPayFilter] = useState({ pending: true, partial: true, paid: true });
  const [toolsCategorias, setToolsCategorias] = useState(false);
  // Registro de "pagado a socia" por item de pedido
  // estructura: { "orderId_itemIdx_s1": true/false, ... }
  const [payouts, setPayouts] = useState({});

  // Lista de clientes (email_list) para sección Clientes
  const [emailList, setEmailList] = useState([]);
  const [customerFilter, setCustomerFilter] = useState('all'); // all | optin | recurring
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCityFilter, setCustomerCityFilter] = useState('');

  // Pedidos NUEVOS (llegaron sin que admin estuviera mirando) — Set de IDs
  // Se borran del set al expandirlos.
  const [unseenOrders, setUnseenOrders] = useState(new Set());

  // Pedidos expandidos en la vista (estilo Shopify) — set de IDs
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  function toggleOrderExpanded(id) {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Al expandir un pedido, marcarlo como visto (quita el verde)
    setUnseenOrders(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // Modal para pedir número de guía cuando se marca pedido como "Enviado"
  const [shippingModal, setShippingModal] = useState(null); // { order, oldStatus } | null

  // Toasts de notificación (estilo Rappi)
  // Cada toast: { id, orderNumber, customerName, total, time }
  const [toasts, setToasts] = useState([]);
  function dismissToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  // Sonido de notificación (WebAudio API, no requiere archivo externo)
  function playNotificationSound() {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      // Beep doble sutil tipo "ding ding"
      const beep = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      };
      beep(880, 0, 0.15);
      beep(1175, 0.12, 0.18);
    } catch (err) {
      console.log('No se pudo reproducir sonido:', err);
    }
  }

  useEffect(() => {
    try {
      const s = localStorage.getItem('dash_socias');
      const p = localStorage.getItem('dash_proyeccion');
      const st = localStorage.getItem('dash_stock');
      const fc = localStorage.getItem('fin_chart');
      const fg = localStorage.getItem('fin_gastos');
      const tp = localStorage.getItem('tbl_pedidos');
      const ti = localStorage.getItem('tbl_inventario');
      const ts = localStorage.getItem('tbl_section');
      const tc = localStorage.getItem('tools_categorias');
      const at = localStorage.getItem('active_tab');
      if (s !== null) setDashSocias(s === '1');
      if (p !== null) setDashProyeccion(p === '1');
      if (st !== null) setDashStock(st === '1');
      if (fc !== null) setFinChart(fc === '1');
      if (fg !== null) setFinGastos(fg === '1');
      if (tp !== null) setTblPedidos(tp === '1');
      if (ti !== null) setTblInventario(ti === '1');
      if (ts !== null) setTblSection(ts === '1');
      if (tc !== null) setToolsCategorias(tc === '1');
      if (at !== null && ['dashboard', 'inventory', 'orders', 'finances', 'catalog', 'tools'].includes(at)) {
        setTabState(at);
      }
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

  // ═══════════════ REALTIME — escuchar pedidos nuevos ═══════════════
  // Cuando llega un INSERT en la tabla orders mientras el admin está abierto,
  // mostramos toast + sonido + marcamos como "no visto".
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new;
          if (!newOrder) return;

          // Agregar a la lista de orders (al principio porque viene ordenado desc)
          setOrders(prev => {
            // Evitar duplicados si ya está
            if (prev.some(o => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });

          // Marcar como no visto (queda verde claro hasta que se expanda)
          setUnseenOrders(prev => {
            const next = new Set(prev);
            next.add(newOrder.id);
            return next;
          });

          // Toast notificación + sonido
          const toastId = `toast-${newOrder.id}-${Date.now()}`;
          setToasts(prev => [
            {
              id: toastId,
              orderId: newOrder.id,
              orderNumber: newOrder.order_number,
              customerName: newOrder.customer_name,
              total: newOrder.total,
              time: new Date(),
            },
            ...prev,
          ].slice(0, 3)); // máx 3 toasts visibles
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  async function loadAll() {
    const [{ data: p }, { data: o }, { data: e }, { data: c }, { data: cc }, { data: cats }, { data: po }, { data: customers }, { data: ed }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('config').select('*').eq('id', 1).single(),
      supabase.from('catalog_config').select('*').eq('id', 1).single(),
      supabase.from('categories').select('name').order('name'),
      supabase.from('partner_payouts').select('*'),
      supabase.from('email_list').select('*').order('last_order_date', { ascending: false }),
      supabase.from('editorial_quote').select('*').eq('id', 1).maybeSingle(),
    ]);
    setProducts(p || []); setOrders(o || []); setExpenses(e || []);
    setEmailList(customers || []);
    if (c) setConfig(c);
    if (cc) setCatCfg(cc);
    if (ed) setEditorialCfg({
      enabled: ed.enabled || false,
      quote_text: ed.quote_text || '',
      photos: ed.photos || [],
      cta_text: ed.cta_text || 'Ver más',
      cta_type: ed.cta_type || 'none',
      cta_value: ed.cta_value || '',
    });
    if (cats && cats.length > 0) setCategories(cats.map(x => x.name));
    // Construir mapa de payouts: "orderId_itemIdx_partnerKey" -> true/false
    const map = {};
    (po || []).forEach(row => {
      map[`${row.order_id}_${row.item_index}_${row.partner_key}`] = row.paid;
    });
    setPayouts(map);
    setLoading(false);
  }

  async function togglePayout(orderId, itemIdx, partnerKey) {
    const key = `${orderId}_${itemIdx}_${partnerKey}`;
    const currentlyPaid = !!payouts[key];
    const nextPaid = !currentlyPaid;
    // Upsert (insert or update)
    const { error } = await supabase.from('partner_payouts').upsert({
      order_id: orderId,
      item_index: itemIdx,
      partner_key: partnerKey,
      paid: nextPaid,
      paid_at: nextPaid ? new Date().toISOString() : null,
    }, { onConflict: 'order_id,item_index,partner_key' });
    if (error) { alert('Error al guardar: ' + error.message); return; }
    setPayouts(prev => ({ ...prev, [key]: nextPaid }));
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
      is_new: prod.is_new || false,
      variants: prod.variants || null,
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
  // Archivar producto (soft delete): no se borra, se marca como archived = true.
  // Los pedidos históricos siguen mostrando bien el producto. Se puede reactivar después.
  async function archiveProduct(id) {
    const { error } = await supabase.from('products').update({ archived: true, stock: 0 }).eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    loadAll();
  }
  async function reactivateProduct(id) {
    const { error } = await supabase.from('products').update({ archived: false }).eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    loadAll();
  }
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
  async function saveEditorial(ed) {
    const clean = {
      enabled: ed.enabled || false,
      quote_text: ed.quote_text || '',
      photos: ed.photos || [],
      cta_text: ed.cta_text || 'Ver más',
      cta_type: ed.cta_type || 'none',
      cta_value: ed.cta_value || '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('editorial_quote').update(clean).eq('id', 1);
    if (error) { alert('Error guardando editorial: ' + error.message); return; }
    setEditorialCfg(prev => ({ ...prev, ...clean }));
    setShowEditorial(false);
  }
  async function saveGallery(gl) {
    const clean = {
      gallery_enabled: gl.gallery_enabled || false,
      gallery_word: gl.gallery_word || '',
      gallery_subtitle: gl.gallery_subtitle || '',
      gallery_cta_text: gl.gallery_cta_text || 'Ver más',
      gallery_cta_type: gl.gallery_cta_type || 'none',
      gallery_cta_value: gl.gallery_cta_value || '',
      gallery_photos: gl.gallery_photos || [],
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('editorial_quote').update(clean).eq('id', 1);
    if (error) { alert('Error guardando gallery: ' + error.message); return; }
    setEditorialCfg(prev => ({ ...prev, ...clean }));
    setShowGallery(false);
  }

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

  // Productos visibles: los que no están archivados. Para inventario, catálogo, nuevo pedido.
  // Los archivados SIGUEN en `products` (sin filtrar) para que los pedidos viejos los referencien bien.
  const visibleProducts = useMemo(() => products.filter(p => !p.archived), [products]);
  const archivedProducts = useMemo(() => products.filter(p => p.archived), [products]);

  // ── STATS POR PRODUCTO (cantidad vendida histórica + última venta) ──
  // Se usa para "top más vendidos" y badges. Toma TODOS los orders no cancelados.
  const productStats = useMemo(() => {
    const stats = {};
    const nonCanc = orders.filter(o => o.status !== 'cancelled');
    nonCanc.forEach(o => {
      (o.items || []).forEach(it => {
        const id = it.productId;
        if (!id) return;
        if (!stats[id]) stats[id] = { sold: 0, lastSoldAt: 0 };
        stats[id].sold += (Number(it.qty) || 0);
        const date = new Date(o.created_at).getTime();
        if (date > stats[id].lastSoldAt) stats[id].lastSoldAt = date;
      });
    });
    return stats;
  }, [orders]);

  // States para filtros y orden de inventario
  const [invFilter, setInvFilter] = useState('all'); // 'all' | 'low' | 'out' | 'archived'
  const [invSort, setInvSort] = useState('recent'); // 'recent' | 'topselling' | 'stock_low' | 'name' | 'price'
  const [showTopSelling, setShowTopSelling] = useState(false);

  // Metrics
  const m = useMemo(() => {
    // Inversión actual en inventario = Σ(costo_unitario × stock), solo productos activos
    const ic = visibleProducts.reduce((s, p) => s + (p.cost_total || 0) * (p.stock || 0), 0);
    // Valor del inventario al precio de venta = Σ(precio × stock)
    const ir = visibleProducts.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0);

    // Pedidos no cancelados del periodo
    const nonCanc = filteredOrders.filter(o => o.status !== 'cancelled');
    const dn = nonCanc.filter(o => o.status === 'delivered');

    // ── CONTABILIDAD ACCRUAL (estándar para negocios) ──
    // Ingresos brutos = total facturado incluyendo envío cobrado (para reporte)
    const rv = nonCanc.reduce((s, o) => s + (o.total || 0), 0);
    // Envío cobrado a clientas: es pass-through (lo reciben y lo pagan al mensajero).
    // NO es ganancia del negocio, no entra a distribución 20/10/35/35.
    const shippingIncome = nonCanc.reduce((s, o) => s + (o.shipping_charge || 0), 0);
    // Ingresos de productos = ventas reales sin envío
    const productRevenue = rv - shippingIncome;
    // Costos = costo real de los productos que salieron del inventario (incluye bolsa+envío logístico interno)
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
    const nt = rv - cs - ex - shippingIncome; // Ganancia neta real del negocio (sin contar envío pass-through)

    // ── DISTRIBUCIÓN DE GANANCIAS ──
    // Modelo SPLENDORA (según documento oficial):
    //   20% → Reserva publicidad (Ads)
    //   10% → Reserva marca (paga bolsas, envío interno, mejoras web, gastos de marca)
    //   35% → Socia 1
    //   35% → Socia 2
    //
    // Los gastos registrados se descuentan en este orden:
    //   1) Primero del 10% Marca (es lo lógico, son gastos de marca)
    //   2) Luego del 20% Ads (overflow)
    //   3) Por último de las socias (50/50) si aún hay déficit
    //
    // cost_total ya incluye bolsa + envío interno (no se duplica con reserva).
    // El envío cobrado a la clienta NO entra a distribución (pass-through al mensajero).
    const gross = productRevenue - cs; // ganancia bruta = ventas productos - costos
    const adsBase = Math.max(0, gross * 0.20);
    const brandBase = Math.max(0, gross * 0.10);
    const socBase = Math.max(0, gross * 0.35);

    let ads, brand, s1, s2;
    let expensesAbsorbedByBrand = 0;
    let expensesAbsorbedByAds = 0;
    let deficitCoveredBySocia = 0;

    let remainingExpenses = ex;

    // Paso 1: descontar del Brand (10%)
    if (remainingExpenses <= brandBase) {
      brand = brandBase - remainingExpenses;
      expensesAbsorbedByBrand = remainingExpenses;
      remainingExpenses = 0;
    } else {
      brand = 0;
      expensesAbsorbedByBrand = brandBase;
      remainingExpenses -= brandBase;
    }

    // Paso 2: descontar del Ads (20%) si aún queda déficit
    if (remainingExpenses <= adsBase) {
      ads = adsBase - remainingExpenses;
      expensesAbsorbedByAds = remainingExpenses;
      remainingExpenses = 0;
    } else {
      ads = 0;
      expensesAbsorbedByAds = adsBase;
      remainingExpenses -= adsBase;
    }

    // Paso 3: lo que queda lo cubren las socias 50/50
    deficitCoveredBySocia = remainingExpenses / 2;
    s1 = socBase - deficitCoveredBySocia;
    s2 = socBase - deficitCoveredBySocia;

    // Mantenemos compatibilidad con código viejo (biz, bizTotal, splendoraReserve)
    const splendoraReserve = 0; // ya NO se usa, se mantiene en 0
    const biz = brand; // alias para no romper código viejo
    const bizTotal = brand + ads; // SPLENDORA total = brand + ads
    const expensesAbsorbedByBiz = expensesAbsorbedByBrand + expensesAbsorbedByAds;

    const paidOrders = nonCanc.filter(o => (o.payment_status || 'pending') === 'paid').length;
    const partialOrders = nonCanc.filter(o => (o.payment_status || 'pending') === 'partial').length;
    const pendingPayOrders = nonCanc.filter(o => (o.payment_status || 'pending') === 'pending').length;

    // ── Proyección si se vende TODO el inventario actual ──
    // Mismo modelo: 20% Ads + 10% Marca + 35% s1 + 35% s2
    const projGross = visibleProducts.reduce((s, p) => s + ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0), 0);
    const projProfit = projGross; // ganancia total bruta proyectada
    const projAds = projGross * 0.20;
    const projBrand = projGross * 0.10;
    const projBiz = projAds + projBrand; // SPLENDORA total proyectada
    const projS1 = projGross * 0.35;
    const projS2 = projGross * 0.35;

    return {
      ic, ir, dn, rv, cs, ex, nt, biz, bizTotal, s1, s2, pc, gross, cashReceived,
      splendoraReserve, shippingIncome, productRevenue,
      ads, brand,
      adsBase, brandBase, socBase,
      expensesAbsorbedByBrand, expensesAbsorbedByAds, expensesAbsorbedByBiz,
      deficitCoveredBySocia,
      paidOrders, partialOrders, pendingPayOrders,
      projProfit, projBiz, projS1, projS2,
      projAds, projBrand,
      // Unidades totales vendidas en el periodo (suma de qty en items de pedidos no cancelados)
      totalProductsSold: nonCanc.reduce((s, o) => s + (o.items || []).reduce((a, i) => a + (i.qty || 0), 0), 0),
      totalUnits: visibleProducts.reduce((s, p) => s + (p.stock || 0), 0),
      low: visibleProducts.filter(p => p.stock > 0 && p.stock <= 2),
      out: visibleProducts.filter(p => p.stock === 0),
      pnd: filteredOrders.filter(o => o.status === 'pending' || o.status === 'confirmed'),
    };
  }, [products, visibleProducts, filteredOrders, filteredExpenses]);

  // ── TABLA DE PEDIDOS (una fila por producto dentro de cada pedido) ──
  const ordersTable = useMemo(() => {
    const rows = [];
    const nonCanc = filteredOrders.filter(o => o.status !== 'cancelled');
    nonCanc.forEach(o => {
      const orderTotal = o.total || 0;
      const amountPaid = o.amount_paid || 0;
      const ps = o.payment_status || 'pending';
      const orderShipping = o.shipping_charge || 0;
      // Total de subtotales de items (para proporcionar el envío entre items)
      const itemsSubtotal = (o.items || []).reduce((s, i) => s + ((i.priceUnit || 0) * (i.qty || 0)), 0);
      (o.items || []).forEach((it, idx) => {
        const prod = products.find(p => p.id === it.productId);
        const costPerUnit = prod ? (prod.cost_total || 0) : 0;
        const priceUnit = it.priceUnit || 0;
        const qty = it.qty || 0;
        const subtotal = priceUnit * qty;
        // Distribuir el pago del pedido proporcional al subtotal del item (sobre el subtotal productos)
        const proportion = itemsSubtotal > 0 ? subtotal / itemsSubtotal : 0;
        // Envío que le corresponde a este item (proporcional)
        const itemShipping = Math.round(orderShipping * proportion);
        let paidOfItem = 0;
        if (ps === 'paid') paidOfItem = subtotal;
        else if (ps === 'partial') {
          // El amount_paid incluye envío. Descontamos envío total del pedido para no inflar pago del producto.
          const paymentToProducts = Math.max(0, amountPaid - orderShipping);
          paidOfItem = Math.min(subtotal, Math.round(paymentToProducts * proportion));
        }
        const dueOfItem = Math.max(0, subtotal - paidOfItem);
        // ── DISTRIBUCIÓN MODELO SPLENDORA (documento oficial) ──
        // Ganancia del item = (precio − costo) × qty
        // De esa ganancia: 20% Ads + 10% Marca + 35% socia 1 + 35% socia 2
        // El envío cobrado a clienta NO entra a comisiones (pass-through al mensajero).
        const itemGross = Math.max(0, (priceUnit - costPerUnit) * qty);
        const commissionS1 = Math.round(itemGross * 0.35);
        const commissionS2 = Math.round(itemGross * 0.35);
        const splendoraShare = Math.round(itemGross * 0.30); // 20% Ads + 10% Marca combinados
        const reserve = 0; // ya NO se usa (compat para no romper UI vieja)
        const paidS1 = !!payouts[`${o.id}_${idx}_s1`];
        const paidS2 = !!payouts[`${o.id}_${idx}_s2`];
        const paidSplendora = !!payouts[`${o.id}_${idx}_sp`];
        const paidInversion = !!payouts[`${o.id}_${idx}_inv`];
        // Inversión = costo total del producto (costo unidad × cantidad) — plata a devolver a la caja de reposición
        const inversion = costPerUnit * qty;
        rows.push({
          orderId: o.id,
          itemIdx: idx,
          date: o.created_at,
          customer: o.customer_name,
          city: o.city || '',
          channel: o.channel,
          productName: it.name,
          productCode: it.code,
          productPhoto: prod?.photo_url || '',
          size: it.size || '',
          color: it.color || '',
          qty,
          costUnit: costPerUnit,
          priceUnit,
          subtotal,
          paidOfItem,
          dueOfItem,
          paymentStatus: ps,
          commissionS1,
          commissionS2,
          splendoraShare,
          inversion,
          reserve,
          itemShipping,
          paidS1,
          paidS2,
          paidSplendora,
          paidInversion,
        });
      });
    });
    return rows;
  }, [filteredOrders, products, payouts]);

  // Tabla filtrada por estado de pago (multi-select)
  const displayedOrdersTable = useMemo(() => {
    return ordersTable.filter(r => {
      const ps = r.paymentStatus || 'pending';
      return tblPayFilter[ps];
    });
  }, [ordersTable, tblPayFilter]);

  // Totales para la tabla (respetan el filtro de estado de pago)
  const ordersTableTotals = useMemo(() => {
    const t = {
      qty: 0, sales: 0, paid: 0, due: 0,
      costTotal: 0,
      shippingTotal: 0,
      s1Total: 0, s1ToPay: 0,
      s2Total: 0, s2ToPay: 0,
      splendoraTotal: 0, splendoraToReceive: 0,
      inversionTotal: 0, inversionToRecover: 0,
    };
    displayedOrdersTable.forEach(r => {
      t.qty += r.qty;
      t.sales += r.subtotal;
      t.paid += r.paidOfItem;
      t.due += r.dueOfItem;
      t.costTotal += r.costUnit * r.qty;
      t.shippingTotal += r.itemShipping || 0;
      t.s1Total += r.commissionS1;
      t.s2Total += r.commissionS2;
      t.splendoraTotal += r.splendoraShare;
      t.inversionTotal += r.inversion;
      if (!r.paidS1) t.s1ToPay += r.commissionS1;
      if (!r.paidS2) t.s2ToPay += r.commissionS2;
      if (!r.paidSplendora) t.splendoraToReceive += r.splendoraShare;
      if (!r.paidInversion) t.inversionToRecover += r.inversion;
    });
    return t;
  }, [displayedOrdersTable]);

  // ── DESCARGAR XLSX REAL (abre en Excel, Google Sheets, Numbers) ──
  async function buildTablesExcel() {
    // Cargar SheetJS dinámicamente desde CDN la primera vez que se usa
    if (typeof window.XLSX === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('No se pudo cargar la librería de Excel'));
        document.head.appendChild(script);
      }).catch(err => { alert(err.message); throw err; });
    }
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const period = fMonth !== null ? `${MONTHS[fMonth]} ${fYear}` : 'Todo';

    // ── HOJA 1: PEDIDOS ──
    const pedidosHeaders = ['Fecha', 'Cliente', 'Ciudad', 'Canal', 'Producto', 'Código', 'Talla', 'Color', 'Cantidad', 'Costo u.', 'Costo total', 'Precio u.', 'Subtotal', 'Envío cobrado', 'Abonado', 'Por cobrar', 'Estado pago', `Com. ${config.partner1}`, `Pagado ${config.partner1}`, `Com. ${config.partner2}`, `Pagado ${config.partner2}`, 'SPLENDORA', 'Recibido SPLENDORA', 'Inversión', 'Recuperada inversión'];
    const pedidosRows = displayedOrdersTable.map(r => [
      new Date(r.date).toLocaleDateString('es-CO'),
      r.customer, r.city, r.channel, r.productName, r.productCode, r.size, r.color,
      r.qty, r.costUnit, r.costUnit * r.qty, r.priceUnit, r.subtotal, r.itemShipping || 0, r.paidOfItem, r.dueOfItem,
      PAYMENT_STATUS[r.paymentStatus]?.label || r.paymentStatus,
      r.commissionS1, r.paidS1 ? 'Sí' : 'No',
      r.commissionS2, r.paidS2 ? 'Sí' : 'No',
      r.splendoraShare, r.paidSplendora ? 'Sí' : 'No',
      r.inversion, r.paidInversion ? 'Sí' : 'No',
    ]);
    // Fila de totales
    const totalesRow = [
      'TOTALES', '', '', '', '', '', '', '',
      ordersTableTotals.qty, '', ordersTableTotals.costTotal, '', ordersTableTotals.sales,
      ordersTableTotals.shippingTotal, ordersTableTotals.paid, ordersTableTotals.due, '',
      ordersTableTotals.s1Total, '',
      ordersTableTotals.s2Total, '',
      ordersTableTotals.splendoraTotal, '',
      ordersTableTotals.inversionTotal, '',
    ];
    const pedidosData = [pedidosHeaders, ...pedidosRows, totalesRow];
    const wsPedidos = XLSX.utils.aoa_to_sheet(pedidosData);
    // Anchos de columnas
    wsPedidos['!cols'] = [
      { wch: 11 }, { wch: 20 }, { wch: 14 }, { wch: 11 }, { wch: 26 }, { wch: 15 }, { wch: 7 }, { wch: 12 },
      { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 12 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPedidos, `Pedidos ${period}`.slice(0, 31));

    // ── HOJA 2: INVENTARIO ──
    // Respeta el filtro actual de la tabla (activos / archivados / todos)
    const invSource = tblInvFilter === 'active' ? visibleProducts
      : tblInvFilter === 'archived' ? archivedProducts
      : products;
    const invHeaders = ['Código', 'Nombre', 'Categorías', 'Tallas', 'Colores', 'Costo producto', 'Bolsa', 'Envío', 'Costo total u.', 'Precio venta u.', 'Descuento %', 'Stock', 'Inversión', 'Valor venta', 'Ganancia proy.', 'Precio oculto', 'Estado'];
    const invRows = [...invSource].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map(p => {
      const inv = (p.cost_total || 0) * (p.stock || 0);
      const val = (p.price || 0) * (p.stock || 0);
      const gp = ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0);
      return [
        p.code, p.name, (p.categories || [p.category]).join(', '),
        (p.sizes || []).join(', ') || p.size || '',
        (p.colors || [p.color]).filter(Boolean).join(', '),
        p.cost_product || 0, p.cost_bag || 0, p.cost_shipping || 0,
        p.cost_total || 0, p.price || 0, p.discount || 0,
        p.stock || 0, inv, val, gp,
        p.hide_price ? 'Sí' : 'No',
        p.archived ? 'Archivado' : 'Activo',
      ];
    });
    // Totales respetando filtro
    const invFUnits = invSource.reduce((s, p) => s + (p.stock || 0), 0);
    const invFCost = invSource.reduce((s, p) => s + (p.cost_total || 0) * (p.stock || 0), 0);
    const invFValue = invSource.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0);
    const invFProj = invSource.reduce((s, p) => s + ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0), 0);
    const invTotalRow = [
      `TOTALES · ${invSource.length} productos`, '', '', '', '',
      '', '', '', '', '', '',
      invFUnits, invFCost, invFValue, invFProj, '', '',
    ];
    const invData = [invHeaders, ...invRows, invTotalRow];
    const wsInv = XLSX.utils.aoa_to_sheet(invData);
    wsInv['!cols'] = [
      { wch: 15 }, { wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
      { wch: 13 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 10 },
      { wch: 7 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 11 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, wsInv, 'Inventario');

    // ── HOJA 3: GASTOS ──
    const gastosHeaders = ['Fecha', 'Descripción', 'Monto', 'Pagado por'];
    const gastosData = [gastosHeaders, ...filteredExpenses.map(x => [
      new Date(x.created_at).toLocaleDateString('es-CO'),
      x.description, x.amount || 0, x.paid_by,
    ])];
    const wsGastos = XLSX.utils.aoa_to_sheet(gastosData);
    wsGastos['!cols'] = [{ wch: 11 }, { wch: 30 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsGastos, `Gastos ${period}`.slice(0, 31));

    // ── HOJA 4: RESUMEN ──
    const resumenData = [
      ['Concepto', 'Valor'],
      ['Periodo', period],
      ['Unidades vendidas', ordersTableTotals.qty],
      ['Ventas productos', ordersTableTotals.sales],
      ['Envío cobrado (pass-through)', ordersTableTotals.shippingTotal],
      ['Cobrado', ordersTableTotals.paid],
      ['Por cobrar', ordersTableTotals.due],
      ['Costo total productos', ordersTableTotals.costTotal],
      ['', ''],
      [`Comisión total ${config.partner1}`, ordersTableTotals.s1Total],
      [`Por pagar a ${config.partner1}`, ordersTableTotals.s1ToPay],
      [`Comisión total ${config.partner2}`, ordersTableTotals.s2Total],
      [`Por pagar a ${config.partner2}`, ordersTableTotals.s2ToPay],
      ['', ''],
      ['SPLENDORA (Ads 20% + Marca 10%)', ordersTableTotals.splendoraTotal],
      ['Por recibir SPLENDORA', ordersTableTotals.splendoraToReceive],
      ['Caja inversión (reposición)', ordersTableTotals.inversionTotal],
      ['Por recuperar en caja inversión', ordersTableTotals.inversionToRecover],
    ];
    const wsRes = XLSX.utils.aoa_to_sheet(resumenData);
    wsRes['!cols'] = [{ wch: 32 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

    // Descargar
    const filename = `SPLENDORA_${period.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

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
                { l: 'Productos', v: visibleProducts.length, s: `${m.totalUnits} unidades · ${m.out.length} agotados` },
                { l: 'Pedidos pend.', v: m.pnd.length, s: `${m.dn.length} entregados`, c: '#4A6FA5' },
                { l: 'Inversión inventario', v: cur(m.ic), s: `${m.totalUnits} und · Valor venta: ${cur(m.ir)}`, c: '#4A6FA5' },
                { l: 'Por cobrar', v: cur(m.pc), s: `${m.partialOrders} abono · ${m.pendingPayOrders} pend.`, c: m.pc > 0 ? '#D4A843' : '#9CA3AF' },
                { l: 'Ingresos (ventas)', v: cur(m.rv), s: `Cobrado: ${cur(m.cashReceived)}`, c: '#4A9E6B' },
                { l: 'Ganancia neta', v: cur(m.nt), s: `SPLENDORA: ${cur(m.bizTotal)}`, c: m.nt >= 0 ? '#4A9E6B' : '#C0504E' },
              ].map((x, i) => (
                <div key={i} className="neu-card" style={{ padding: 14 }}>
                  <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 7 }}>{x.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: x.c || '#1A1D23' }}>{x.v}</div>
                  <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>{x.s}</div>
                </div>
              ))}
            </div>

            {/* Division 20% Ads / 10% Marca / 35% / 35% */}
            <div className="neu-card" style={{ marginTop: 14 }}>
              <div onClick={() => toggleDash(setDashSocias, dashSocias, 'dash_socias')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: dashSocias ? 12 : 0, userSelect: 'none' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5 }}>División (20% Ads / 10% Marca / 35% / 35%)</div>
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{dashSocias ? '▾' : '▸'}</span>
              </div>
              {dashSocias && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { n: '📢 Ads', p: '20%', v: m.ads, c: '#1A1D23', sub: m.expensesAbsorbedByAds > 0 ? `Cubrió ${cur(m.expensesAbsorbedByAds)}` : null },
                    { n: '🏷 Marca', p: '10%', v: m.brand, c: '#4A6FA5', sub: m.expensesAbsorbedByBrand > 0 ? `Cubrió ${cur(m.expensesAbsorbedByBrand)}` : null },
                    { n: config.partner1, p: '35%', v: m.s1, c: '#1A1D23', sub: m.deficitCoveredBySocia > 0 ? `−${cur(m.deficitCoveredBySocia)}` : null },
                    { n: config.partner2, p: '35%', v: m.s2, c: '#1A1D23', sub: m.deficitCoveredBySocia > 0 ? `−${cur(m.deficitCoveredBySocia)}` : null },
                  ].map((x, i) => (
                    <div key={i} className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 10 }}>
                      <div style={{ fontSize: 8, color: '#6B7280' }}>{x.n} ({x.p})</div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: x.v < 0 ? '#C0504E' : x.c }}>{cur(x.v)}</div>
                      {x.sub && <div style={{ fontSize: 7, color: '#9CA3AF', marginTop: 3 }}>{x.sub}</div>}
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      { n: '📢 Ads', p: '20%', v: m.projAds, c: '#1A1D23' },
                      { n: '🏷 Marca', p: '10%', v: m.projBrand, c: '#4A6FA5' },
                      { n: config.partner1, p: '35%', v: m.projS1, c: '#1A1D23' },
                      { n: config.partner2, p: '35%', v: m.projS2, c: '#1A1D23' },
                    ].map((x, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: 8, borderRadius: 10, background: '#F0F2F5' }}>
                        <div style={{ fontSize: 7, color: '#6B7280' }}>{x.n} ({x.p})</div>
                        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2, color: x.c }}>{cur(x.v)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 8, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>Basado en {visibleProducts.reduce((s, p) => s + (p.stock || 0), 0)} unidades en inventario</div>
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

            {/* Calcular counters para filtros */}
            {(() => {
              const lowStockProducts = visibleProducts.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 2);
              const outOfStockProducts = visibleProducts.filter(p => (p.stock || 0) === 0);
              const lowCount = lowStockProducts.length;
              const outCount = outOfStockProducts.length;
              const archivedCount = archivedProducts.length;
              const totalCount = visibleProducts.length;

              // Productos top vendidos (max 5)
              const topSelling = [...visibleProducts]
                .map(p => ({ ...p, _sold: productStats[p.id]?.sold || 0 }))
                .filter(p => p._sold > 0)
                .sort((a, b) => b._sold - a._sold)
                .slice(0, 5);

              return (
                <>
                  {/* Stats principales */}
                  <div className="neu-card" style={{ padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Resumen</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <div className="neu-card neu-pressed" style={{ padding: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Unidades</div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{m.totalUnits}</div>
                      </div>
                      <div className="neu-card neu-pressed" style={{ padding: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Stock bajo</div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, color: lowCount > 0 ? '#D4A843' : '#6B7280' }}>{lowCount}</div>
                      </div>
                      <div className="neu-card neu-pressed" style={{ padding: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Agotados</div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, color: outCount > 0 ? '#C0504E' : '#6B7280' }}>{outCount}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
                      Inversión <b style={{ color: '#4A6FA5' }}>{cur(m.ic)}</b> · Valor venta <b style={{ color: '#4A9E6B' }}>{cur(m.ir)}</b>
                    </div>
                  </div>

                  {/* Alerta stock bajo */}
                  {lowCount > 0 && (
                    <div style={{
                      background: '#FEF3C7',
                      borderLeft: '3px solid #D4A843',
                      padding: '10px 12px',
                      borderRadius: 8,
                      marginBottom: 12,
                      fontSize: 11,
                      color: '#92400E',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }} onClick={() => setInvFilter('low')}>
                      <span>⚠️</span>
                      <span><b>{lowCount} producto{lowCount === 1 ? '' : 's'}</b> con stock bajo (≤ 2 unidades). Tap para ver.</span>
                    </div>
                  )}

                  {/* Top 5 más vendidos (colapsable) */}
                  {topSelling.length > 0 && (
                    <div className="neu-card" style={{ padding: 12, marginBottom: 12 }}>
                      <div onClick={() => setShowTopSelling(!showTopSelling)}
                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showTopSelling ? 10 : 0, userSelect: 'none' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.5 }}>🏆 Top {topSelling.length} más vendidos</div>
                        <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{showTopSelling ? '▾' : '▸'}</span>
                      </div>
                      {showTopSelling && (
                        <div>
                          {topSelling.map((p, i) => {
                            const rankColors = ['#D4A843', '#9CA3AF', '#B45309', '#1A1D23', '#1A1D23'];
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < topSelling.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
                                <div style={{
                                  width: 22, height: 22, borderRadius: '50%',
                                  background: rankColors[i], color: '#FFF',
                                  fontSize: 10, fontWeight: 800,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0,
                                }}>{i + 1}</div>
                                <Thumb src={p.photo_url} size={36} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                  <div style={{ fontSize: 9, color: '#6B7280' }}>{p.code} · Stock: {p.stock}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: '#4A9E6B' }}>{p._sold}</div>
                                  <div style={{ fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase' }}>vendidos</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Filtros pill */}
                  <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
                    {[
                      { id: 'all', label: 'Todos', count: totalCount },
                      { id: 'low', label: '⚠️ Stock bajo', count: lowCount, color: '#D4A843' },
                      { id: 'out', label: '🔴 Agotados', count: outCount, color: '#C0504E' },
                      { id: 'archived', label: '📦 Archivados', count: archivedCount, color: '#6B7280' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setInvFilter(opt.id)}
                        style={{
                          flexShrink: 0,
                          padding: '6px 12px',
                          borderRadius: 100,
                          fontSize: 10, fontWeight: 700,
                          background: invFilter === opt.id ? '#1A1D23' : '#F0F2F5',
                          color: invFilter === opt.id ? '#FFF' : '#6B7280',
                          cursor: 'pointer',
                          border: 'none',
                          boxShadow: invFilter === opt.id ? '3px 3px 6px #D1D3D6, -3px -3px 6px #FFFFFF' : 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontFamily: "'Montserrat', sans-serif",
                        }}>
                        <span>{opt.label}</span>
                        <span style={{
                          background: invFilter === opt.id ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
                          padding: '1px 6px', borderRadius: 8, fontSize: 9,
                        }}>{opt.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* Búsqueda + Orden */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <div className="neu-pressed" style={{ flex: 1, padding: 0, borderRadius: 8 }}>
                      <input className="neu-input" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ boxShadow: 'none', background: 'transparent', width: '100%' }} />
                    </div>
                    <select
                      value={invSort}
                      onChange={e => setInvSort(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        background: '#F0F2F5',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 11, fontWeight: 600,
                        color: '#1A1D23',
                        boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
                        fontFamily: "'Montserrat', sans-serif",
                        cursor: 'pointer',
                      }}>
                      <option value="recent">📅 Recientes</option>
                      <option value="topselling">🏆 Más vendidos</option>
                      <option value="stock_low">📉 Stock bajo</option>
                      <option value="name">🔤 Nombre</option>
                      <option value="price">💰 Precio</option>
                    </select>
                  </div>

                  {/* Lista filtrada y ordenada */}
                  {(() => {
                    // Pool según filtro
                    let pool;
                    if (invFilter === 'low') pool = lowStockProducts;
                    else if (invFilter === 'out') pool = outOfStockProducts;
                    else if (invFilter === 'archived') pool = archivedProducts;
                    else pool = visibleProducts;

                    // Aplicar búsqueda
                    let list = pool.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase()));

                    // Aplicar orden
                    if (invSort === 'topselling') {
                      list = [...list].sort((a, b) => (productStats[b.id]?.sold || 0) - (productStats[a.id]?.sold || 0));
                    } else if (invSort === 'stock_low') {
                      list = [...list].sort((a, b) => (a.stock || 0) - (b.stock || 0));
                    } else if (invSort === 'name') {
                      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    } else if (invSort === 'price') {
                      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
                    }
                    // 'recent' = orden por defecto (created_at desc) ya viene del loadAll

                    if (list.length === 0) {
                      return (
                        <div className="neu-card neu-pressed" style={{ padding: 20, textAlign: 'center', color: '#6B7280', fontSize: 12 }}>
                          {invFilter === 'archived' ? 'No hay productos archivados' :
                           invFilter === 'low' ? 'Ningún producto con stock bajo 🎉' :
                           invFilter === 'out' ? 'Ningún producto agotado 🎉' :
                           search ? 'Sin resultados para la búsqueda' :
                           'No hay productos. ¡Crea el primero!'}
                        </div>
                      );
                    }

                    // Top sellers para badge "TOP VENTAS" (los top 3 históricos)
                    const topSellerIds = new Set(topSelling.slice(0, 3).map(p => p.id));

                    return list.map(p => {
                      const inv = (p.cost_total || 0) * (p.stock || 0);
                      const val = (p.price || 0) * (p.stock || 0);
                      const stock = Number(p.stock) || 0;
                      const isOut = stock === 0;
                      const isLow = stock > 0 && stock <= 2;
                      const isTopSeller = topSellerIds.has(p.id);
                      const soldCount = productStats[p.id]?.sold || 0;

                      return (
                        <div key={p.id} className="neu-card" style={{
                          padding: 12,
                          display: 'flex',
                          gap: 10,
                          alignItems: 'center',
                          marginBottom: 8,
                          opacity: p.archived ? 0.7 : 1,
                          borderLeft: isLow ? '3px solid #D4A843' : isOut ? '3px solid #C0504E' : 'none',
                        }}>
                          <Thumb src={p.photo_url} size={50} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#4A6FA5', boxShadow: 'var(--pressed)', padding: '2px 7px', borderRadius: 6 }}>{p.code}</span>
                              {p.archived && <span style={{ fontSize: 8, fontWeight: 700, background: '#E5E7EB', color: '#6B7280', padding: '2px 6px', borderRadius: 4 }}>📦 ARCHIVADO</span>}
                              {!p.archived && isOut && <span style={{ fontSize: 8, fontWeight: 800, background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: 4 }}>🔴 AGOTADO</span>}
                              {!p.archived && isLow && <span style={{ fontSize: 8, fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 4 }}>⚠️ STOCK BAJO</span>}
                              {!p.archived && isTopSeller && !isOut && <span style={{ fontSize: 8, fontWeight: 800, background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: 4 }}>🔥 TOP VENTAS</span>}
                              {p.discount > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#C0504E', background: '#FEE2E2', padding: '1px 5px', borderRadius: 4 }}>-{p.discount}%</span>}
                              {p.is_new && <span style={{ fontSize: 8, fontWeight: 700, color: '#FFF', background: '#1A1D23', padding: '1px 5px', borderRadius: 4 }}>⭐ NUEVO</span>}
                              {p.hide_price && <span style={{ fontSize: 8, fontWeight: 700, color: '#6B7280', background: '#E5E7EB', padding: '1px 5px', borderRadius: 4 }}>$ oculto</span>}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>
                              {(p.categories || [p.category]).join(', ')} · {cur(p.price)}
                            </div>
                            <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 3 }}>
                              {soldCount > 0 && <>Vendidos: <b style={{ color: '#4A9E6B' }}>{soldCount}</b> · </>}
                              Inv: <b style={{ color: '#4A6FA5' }}>{cur(inv)}</b> · Venta: <b style={{ color: '#4A9E6B' }}>{cur(val)}</b>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <div className="neu-card neu-pressed" style={{ padding: '3px 10px', borderRadius: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: isOut ? '#C0504E' : isLow ? '#D4A843' : '#4A9E6B' }}>{p.stock}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="neu-btn neu-btn-sm" onClick={() => { setEditProd(p); setShowProd(true); }} style={{ padding: '3px 7px' }}>✎</button>
                              {p.archived ? (
                                <button className="neu-btn neu-btn-sm" onClick={() => {
                                  if (confirm(`¿Restaurar "${p.name}"?\n\nVolverá a estar disponible en inventario y catálogo.`)) reactivateProduct(p.id);
                                }} style={{ padding: '3px 7px', fontSize: 10 }} title="Restaurar">↺</button>
                              ) : (
                                <button className="neu-btn neu-btn-sm" onClick={() => {
                                  if (confirm(`¿Archivar "${p.name}"?\n\n• El producto se oculta del inventario, catálogo y pedidos nuevos\n• Los pedidos viejos que lo vendieron siguen funcionando bien\n• Lo puedes reactivar cuando vuelvas a comprarlo\n\nNO se pierde el historial.`)) archiveProduct(p.id);
                                }} style={{ padding: '3px 7px', fontSize: 10 }} title="Archivar (se oculta pero no se borra)">📦</button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
              );
            })()}
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
            ) : (
              <div className="neu-card" style={{ padding: 4, marginBottom: 8, background: '#FFFFFF' }}>
                {filteredOrders.map((o, idx) => {
                  const ps = o.payment_status || 'pending';
                  const psCfg = PAYMENT_STATUS[ps];
                  const due = Math.max(0, (o.total || 0) - (o.amount_paid || 0));
                  const isExpanded = expandedOrders.has(o.id);
                  const isUnseen = unseenOrders.has(o.id);
                  const isCancelled = o.status === 'cancelled';
                  const isRefunded = o.status === 'refunded' || ps === 'refunded';

                  // Foto principal del primer producto
                  const firstItem = (o.items || [])[0];
                  const firstProd = firstItem ? products.find(p => p.id === firstItem.productId) : null;
                  const firstPhoto = firstProd?.photo_url;
                  const totalQty = (o.items || []).reduce((s, it) => s + (it.qty || 0), 0);

                  // Resumen corto de items para la fila colapsada
                  const itemSummary = (o.items || []).map(i =>
                    `${i.name}${i.size ? ` · ${i.size}` : ''}${i.color ? ` · ${i.color}` : ''}`
                  ).join(' | ');

                  // Estado para el badge: si está cancelado/refunded, mostrar eso. Sino mostrar status normal.
                  let badgeColor, badgeBg, badgeLabel;
                  if (isRefunded) {
                    badgeColor = '#991B1B'; badgeBg = '#FEE2E2'; badgeLabel = 'Reembolsado';
                  } else if (isCancelled) {
                    badgeColor = '#991B1B'; badgeBg = '#FEE2E2'; badgeLabel = 'Cancelado';
                  } else {
                    badgeColor = STATUS[o.status]?.color || '#6B7280';
                    badgeBg = '#F0F2F5';
                    badgeLabel = STATUS[o.status]?.label || o.status;
                  }

                  return (
                    <div key={o.id}>
                      {idx > 0 && <div style={{ height: 1, background: '#F0F2F5', margin: '0 14px' }} />}

                      {/* FILA COMPACTA (clickeable) */}
                      <div
                        onClick={() => toggleOrderExpanded(o.id)}
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          borderRadius: 10,
                          background: isUnseen
                            ? '#D1FAE5'  // verde claro: pedido nuevo no visto
                            : isExpanded
                              ? '#F9FAFB'
                              : 'transparent',
                          opacity: (isCancelled || isRefunded) ? 0.65 : 1,
                          transition: 'background 0.15s',
                          position: 'relative',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {/* Foto */}
                          <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            {firstPhoto
                              ? <img src={firstPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 16, color: '#9CA3AF' }}>📦</span>
                            }
                            {totalQty > 1 && (
                              <span style={{ position: 'absolute', bottom: 0, right: 0, background: '#1A1D23', color: '#FFF', fontSize: 8, fontWeight: 800, padding: '1px 4px', borderTopLeftRadius: 6 }}>×{totalQty}</span>
                            )}
                          </div>

                          {/* Info principal */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 1 }}>
                              {o.order_number && (
                                <span style={{ color: '#4A6FA5', fontWeight: 800, fontSize: 11 }}>#{o.order_number}</span>
                              )}
                              {isUnseen && (
                                <span style={{
                                  background: '#10B981', color: '#FFF',
                                  fontSize: 8, fontWeight: 800, letterSpacing: 0.5,
                                  padding: '1px 5px', borderRadius: 3,
                                  textTransform: 'uppercase',
                                }}>NUEVO</span>
                              )}
                              <span style={{
                                fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                textDecoration: (isCancelled || isRefunded) ? 'line-through' : 'none',
                              }}>
                                {o.customer_name || '(sin nombre)'}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {itemSummary}{o.city ? ` · ${o.city}` : ''}
                            </div>
                          </div>

                          {/* Monto + estado */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 800,
                              textDecoration: (isCancelled || isRefunded) ? 'line-through' : 'none',
                            }}>{cur(o.total)}</div>
                            <span style={{
                              display: 'inline-block', padding: '2px 7px', borderRadius: 5,
                              fontSize: 9, fontWeight: 700, color: badgeColor, background: badgeBg, marginTop: 3,
                            }}>{badgeLabel}</span>
                          </div>
                        </div>
                      </div>

                      {/* PANEL EXPANDIDO */}
                      {isExpanded && (
                        <div style={{
                          padding: '0 14px 14px',
                          borderTop: '1px solid #E5E7EB',
                          marginTop: -4,
                          background: '#F9FAFB',
                          borderBottomLeftRadius: 10,
                          borderBottomRightRadius: 10,
                        }}>
                          {/* Detalles cliente */}
                          <div style={{ paddingTop: 12, marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>
                              <strong>📞 {o.customer_phone || '—'}</strong>
                              {o.customer_doc && <span> · CC {o.customer_doc}</span>}
                            </div>
                            {o.customer_email && (
                              <div style={{ fontSize: 10, marginBottom: 4 }}>
                                <a href={`mailto:${o.customer_email}`} style={{ color: '#4A6FA5', textDecoration: 'none' }}>📧 {o.customer_email}</a>
                              </div>
                            )}
                            {o.customer_address && (
                              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>
                                🏠 {o.customer_address}{o.city ? `, ${o.city}` : ''}
                              </div>
                            )}
                            {o.customer_notes && (
                              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 4, fontStyle: 'italic' }}>
                                📝 {o.customer_notes}
                              </div>
                            )}
                            <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 6 }}>
                              {o.channel || 'Manual'} · {new Date(o.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {o.payment_notes && (
                              <div style={{ fontSize: 9, color: '#6B7280', marginTop: 4, padding: '6px 8px', background: '#FFFFFF', borderRadius: 6, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                                {o.payment_notes}
                              </div>
                            )}
                          </div>

                          {/* Detalle de items */}
                          {(o.items || []).length > 0 && (
                            <div style={{ background: '#FFFFFF', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                              {(o.items || []).map((it, i) => {
                                const prod = products.find(p => p.id === it.productId);
                                return (
                                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 11 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 4, overflow: 'hidden', background: '#E5E7EB', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {prod?.photo_url
                                        ? <img src={prod.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <span style={{ fontSize: 12, color: '#9CA3AF' }}>📦</span>
                                      }
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                                      <div style={{ color: '#9CA3AF', fontSize: 9 }}>
                                        ×{it.qty}{it.size ? ` · ${it.size}` : ''}{it.color ? ` · ${it.color}` : ''}
                                      </div>
                                    </div>
                                    <div style={{ fontWeight: 700 }}>{cur(it.subtotal || (it.priceUnit * it.qty))}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Tarjeta de tracking — solo si pedido ya enviado con guía */}
                          {o.tracking_number && (o.status === 'shipped' || o.status === 'delivered') && (
                            <div style={{ background: '#1A1D23', color: '#FFF', padding: '12px 14px', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 8, color: '#9CA3AF', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                                  🚚 {o.tracking_carrier || 'Empresa'}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {o.tracking_number}
                                </div>
                              </div>
                              <a
                                href={(() => {
                                  const c = (o.tracking_carrier || '').toLowerCase();
                                  if (c.includes('inter')) return 'https://siguetuenvio.interrapidisimo.com/';
                                  if (c.includes('servientrega')) return 'https://www.servientrega.com/wps/portal/origen-de-carga/rastreo';
                                  if (c.includes('coordinadora')) return 'https://coordinadora.com/rastreo/';
                                  if (c.includes('tcc')) return 'https://tcc.com.co/rastreo';
                                  return `https://www.google.com/search?q=rastreo+${encodeURIComponent(o.tracking_carrier || '')}+${o.tracking_number}`;
                                })()}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Copiar número de guía al portapapeles para pegar fácil
                                  try {
                                    navigator.clipboard?.writeText(o.tracking_number);
                                  } catch {}
                                }}
                                style={{
                                  padding: '6px 12px', background: '#FFF', color: '#1A1D23',
                                  borderRadius: 6, fontSize: 10, fontWeight: 700,
                                  textDecoration: 'none', whiteSpace: 'nowrap',
                                }}>
                                Copiar y rastrear
                              </a>
                            </div>
                          )}

                          {/* Estado de entrega — solo si no está cancelado/reembolsado */}
                          {!isCancelled && !isRefunded && (
                            <>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Estado del pedido</div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                                {Object.entries(STATUS).filter(([k]) => k !== 'cancelled' && k !== 'refunded').map(([k, v]) => (
                                  <button
                                    key={k}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Si pasa a "Enviado" y tiene email, abrir modal para pedir guía
                                      if (k === 'shipped' && o.customer_email && o.status !== 'shipped') {
                                        setShippingModal({ order: o, oldStatus: o.status });
                                      } else {
                                        updateOrderStatus(o.id, k, o.items, o.status);
                                      }
                                    }}
                                    style={{
                                      padding: '5px 10px', fontSize: 10, fontWeight: 700,
                                      background: o.status === k ? v.color : '#FFFFFF',
                                      color: o.status === k ? '#FFFFFF' : '#6B7280',
                                      border: 'none', borderRadius: 6, cursor: 'pointer',
                                      boxShadow: o.status === k ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
                                      fontFamily: "'Montserrat', sans-serif",
                                    }}>
                                    {v.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Estado de pago — solo si no es reembolsado */}
                          {!isRefunded && (
                            <>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Pago</div>
                              {ps !== 'paid' && !isCancelled && (
                                <div style={{ padding: '6px 10px', background: '#FFFFFF', borderRadius: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                                  <span>Abonado: <b style={{ color: '#4A9E6B' }}>{cur(o.amount_paid || 0)}</b></span>
                                  <span>Por cobrar: <b style={{ color: '#C0504E' }}>{cur(due)}</b></span>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updatePayment(o.id, 'pending', 0); }}
                                  style={{
                                    padding: '5px 10px', fontSize: 10, fontWeight: 700,
                                    background: ps === 'pending' ? PAYMENT_STATUS.pending.color : '#FFFFFF',
                                    color: ps === 'pending' ? '#FFFFFF' : '#6B7280',
                                    border: 'none', borderRadius: 6, cursor: 'pointer',
                                    boxShadow: ps === 'pending' ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
                                    fontFamily: "'Montserrat', sans-serif",
                                  }}>○ Pendiente</button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const current = o.amount_paid || 0;
                                    const s = prompt(`Abono TOTAL acumulado de la clienta\n(Total del pedido: ${cur(o.total)})\n${current > 0 ? `Ya tenía abonado: ${cur(current)}` : ''}`, String(current));
                                    if (s === null) return;
                                    const n = Number(s);
                                    if (isNaN(n) || n < 0) { alert('Monto inválido'); return; }
                                    if (n >= (o.total || 0)) { updatePayment(o.id, 'paid', o.total); return; }
                                    updatePayment(o.id, 'partial', n);
                                  }}
                                  style={{
                                    padding: '5px 10px', fontSize: 10, fontWeight: 700,
                                    background: ps === 'partial' ? PAYMENT_STATUS.partial.color : '#FFFFFF',
                                    color: ps === 'partial' ? '#FFFFFF' : '#6B7280',
                                    border: 'none', borderRadius: 6, cursor: 'pointer',
                                    boxShadow: ps === 'partial' ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
                                    fontFamily: "'Montserrat', sans-serif",
                                  }}>◐ Abono</button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updatePayment(o.id, 'paid', o.total); }}
                                  style={{
                                    padding: '5px 10px', fontSize: 10, fontWeight: 700,
                                    background: ps === 'paid' ? PAYMENT_STATUS.paid.color : '#FFFFFF',
                                    color: ps === 'paid' ? '#FFFFFF' : '#6B7280',
                                    border: 'none', borderRadius: 6, cursor: 'pointer',
                                    boxShadow: ps === 'paid' ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
                                    fontFamily: "'Montserrat', sans-serif",
                                  }}>● Pagado</button>
                              </div>
                            </>
                          )}

                          {/* Acciones secundarias */}
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #E5E7EB' }}>
                            {!isCancelled && !isRefunded && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('¿Cancelar este pedido?\n\nEl stock de los productos volverá al inventario.')) {
                                    updateOrderStatus(o.id, 'cancelled', o.items, o.status);
                                  }
                                }}
                                style={{
                                  padding: '5px 10px', fontSize: 10, fontWeight: 700,
                                  background: '#FFFFFF', color: '#C0504E',
                                  border: '1px solid #FCA5A5', borderRadius: 6, cursor: 'pointer',
                                  fontFamily: "'Montserrat', sans-serif",
                                }}>Cancelar pedido</button>
                            )}
                            <button
                              title="Borrar permanentemente"
                              onClick={(e) => {
                                e.stopPropagation();
                                const msg = (!isCancelled && !isRefunded)
                                  ? `¿Borrar este pedido PERMANENTEMENTE?\n\nCliente: ${o.customer_name}\nTotal: ${cur(o.total)}\n\nLas unidades volverán al inventario.\nEsta acción NO se puede deshacer.`
                                  : `¿Borrar este pedido PERMANENTEMENTE?\n\nCliente: ${o.customer_name}\nTotal: ${cur(o.total)}\n\nEsta acción NO se puede deshacer.`;
                                if (confirm(msg)) deleteOrder(o.id, o.items, o.status);
                              }}
                              style={{
                                padding: '5px 10px', fontSize: 12,
                                background: '#FFFFFF', color: '#9CA3AF',
                                border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer',
                              }}>🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                <div className="neu-card" style={{ textAlign: 'center', padding: 10, background: '#F0F2F5' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>📢 RESERVA ADS (20%)</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3, color: m.ads < m.adsBase ? '#D4A843' : '#1A1D23' }}>{cur(m.ads)}</div>
                  {m.expensesAbsorbedByAds > 0 && <div style={{ fontSize: 7, color: '#9CA3AF', marginTop: 3, lineHeight: 1.3 }}>Cubrió {cur(m.expensesAbsorbedByAds)} en gastos</div>}
                </div>
                <div className="neu-card" style={{ textAlign: 'center', padding: 10, background: '#F0F2F5' }}>
                  <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>🏷 RESERVA MARCA (10%)</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3, color: m.brand < m.brandBase ? '#D4A843' : '#1A1D23' }}>{cur(m.brand)}</div>
                  {m.expensesAbsorbedByBrand > 0 && <div style={{ fontSize: 7, color: '#9CA3AF', marginTop: 3, lineHeight: 1.3 }}>Cubrió {cur(m.expensesAbsorbedByBrand)} en gastos</div>}
                </div>
                <div className="neu-card" style={{ textAlign: 'center', padding: 10 }}>
                  <div style={{ fontSize: 8, color: '#6B7280' }}>{config.partner1} (35%)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3, color: m.s1 < 0 ? '#C0504E' : '#1A1D23' }}>{cur(m.s1)}</div>
                  {m.deficitCoveredBySocia > 0 && <div style={{ fontSize: 7, color: '#9CA3AF', marginTop: 3, lineHeight: 1.3 }}>Cubrió {cur(m.deficitCoveredBySocia)} de déficit</div>}
                </div>
                <div className="neu-card" style={{ textAlign: 'center', padding: 10 }}>
                  <div style={{ fontSize: 8, color: '#6B7280' }}>{config.partner2} (35%)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3, color: m.s2 < 0 ? '#C0504E' : '#1A1D23' }}>{cur(m.s2)}</div>
                  {m.deficitCoveredBySocia > 0 && <div style={{ fontSize: 7, color: '#9CA3AF', marginTop: 3, lineHeight: 1.3 }}>Cubrió {cur(m.deficitCoveredBySocia)} de déficit</div>}
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 10, textAlign: 'center', fontStyle: 'italic', lineHeight: 1.5 }}>
                * Ingresos = ventas del periodo. Ganancia neta = ingresos − costos − gastos.<br/>
                Distribución sobre la ganancia bruta: 20% Reserva Ads · 10% Reserva Marca · 35% cada socia.<br/>
                Los gastos se descuentan primero del 10% Marca, luego del 20% Ads, último de las socias 50/50.
              </div>
            </div>

            {/* Cálculo auxiliar para los bases (sin tocar m) */}
            {(() => { return null; })()}

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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="neu-btn neu-btn-sm" onClick={() => setShowCatCfg(true)}>🎨 Config</button>
                <button className="neu-btn neu-btn-sm" onClick={() => setShowEditorial(true)}>📝 Editorial</button>
                <button className="neu-btn neu-btn-sm" onClick={() => setShowGallery(true)}>🖼️ Gallery</button>
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
              {visibleProducts.filter(p => p.stock > 0 && (catFilter === 'Todas' || (p.categories || [p.category]).includes(catFilter))).map(p => (
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
                        const url = `${window.location.origin}/producto/${encodeURIComponent(p.code)}`;
                        navigator.clipboard?.writeText(url);
                        alert('🔗 Link copiado (con preview para WhatsApp):\n' + url);
                      }}>
                      🔗 Copiar link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CUSTOMERS ═══ */}
        {tab === 'customers' && (
          <CustomersSection
            emailList={emailList}
            filter={customerFilter}
            setFilter={setCustomerFilter}
            search={customerSearch}
            setSearch={setCustomerSearch}
            cityFilter={customerCityFilter}
            setCityFilter={setCustomerCityFilter}
          />
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

            {/* ═══ TABLAS ═══ */}
            <div className="neu-card" style={{ marginBottom: 12, padding: 14 }}>
              <div onClick={() => toggleDash(setTblSection, tblSection, 'tbl_section')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tblSection ? 10 : 0, userSelect: 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>📊 Tablas</div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>Resumen detallado para contabilidad</div>
                </div>
                <span style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 700 }}>{tblSection ? '▾' : '▸'}</span>
              </div>

              {tblSection && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <button className="neu-btn neu-btn-accent neu-btn-sm" onClick={buildTablesExcel}>⬇ Descargar Excel / Google Sheets</button>
                  </div>

                  <MonthFilter month={fMonth} year={fYear} onChange={(mm, y) => { setFMonth(mm); setFYear(y); }} />

                  {/* Totales */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    <div className="neu-card neu-pressed" style={{ padding: 8 }}>
                      <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ventas del periodo</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#4A9E6B', marginTop: 2 }}>{cur(ordersTableTotals.sales)}</div>
                      <div style={{ fontSize: 8, color: '#9CA3AF', marginTop: 2 }}>Cobrado: {cur(ordersTableTotals.paid)} · Por cobrar: {cur(ordersTableTotals.due)}</div>
                    </div>
                    <div className="neu-card neu-pressed" style={{ padding: 8 }}>
                      <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Caja inversión (reposición)</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D23', marginTop: 2 }}>{cur(ordersTableTotals.inversionTotal)}</div>
                      <div style={{ fontSize: 8, color: ordersTableTotals.inversionToRecover > 0 ? '#D4A843' : '#4A9E6B', marginTop: 2, fontWeight: 700 }}>Por recuperar: {cur(ordersTableTotals.inversionToRecover)}</div>
                    </div>
                    <div className="neu-card neu-pressed" style={{ padding: 8 }}>
                      <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>SPLENDORA</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#4A6FA5', marginTop: 2 }}>{cur(ordersTableTotals.splendoraTotal)}</div>
                      <div style={{ fontSize: 8, color: ordersTableTotals.splendoraToReceive > 0 ? '#D4A843' : '#4A9E6B', marginTop: 2, fontWeight: 700 }}>Por recibir: {cur(ordersTableTotals.splendoraToReceive)}</div>
                    </div>
                    <div className="neu-card neu-pressed" style={{ padding: 8 }}>
                      <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Totales</div>
                      <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{ordersTableTotals.qty} unidades</div>
                      <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 2 }}>Costo: {cur(ordersTableTotals.costTotal)}</div>
                    </div>
                    <div className="neu-card neu-pressed" style={{ padding: 8 }}>
                      <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{config.partner1} (35%)</div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{cur(ordersTableTotals.s1Total)}</div>
                      <div style={{ fontSize: 8, color: ordersTableTotals.s1ToPay > 0 ? '#D4A843' : '#4A9E6B', marginTop: 2, fontWeight: 700 }}>Por pagar: {cur(ordersTableTotals.s1ToPay)}</div>
                    </div>
                    <div className="neu-card neu-pressed" style={{ padding: 8 }}>
                      <div style={{ fontSize: 7, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{config.partner2} (35%)</div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{cur(ordersTableTotals.s2Total)}</div>
                      <div style={{ fontSize: 8, color: ordersTableTotals.s2ToPay > 0 ? '#D4A843' : '#4A9E6B', marginTop: 2, fontWeight: 700 }}>Por pagar: {cur(ordersTableTotals.s2ToPay)}</div>
                    </div>
                  </div>

                  {/* ── TABLA 1: PEDIDOS ── */}
                  <div style={{ borderRadius: 10, boxShadow: 'var(--raised-sm)', padding: 10, marginBottom: 10 }}>
                    <div onClick={() => toggleDash(setTblPedidos, tblPedidos, 'tbl_pedidos')}
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tblPedidos ? 10 : 0, userSelect: 'none' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#1A1D23' }}>
                        📋 Pedidos {fMonth !== null ? `— ${MONTHS[fMonth]} ${fYear}` : '— Todo'} ({displayedOrdersTable.length}{displayedOrdersTable.length !== ordersTable.length ? ` de ${ordersTable.length}` : ''} filas)
                      </div>
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{tblPedidos ? '▾' : '▸'}</span>
                    </div>
                    {tblPedidos && (
                      <>
                        {/* Filtro multi-select por estado de pago */}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, marginRight: 4 }}>Estado de pago:</span>
                          {[
                            { k: 'pending', l: 'Pendiente', cfg: PAYMENT_STATUS.pending },
                            { k: 'partial', l: 'Abono', cfg: PAYMENT_STATUS.partial },
                            { k: 'paid', l: 'Pagado', cfg: PAYMENT_STATUS.paid },
                          ].map(opt => {
                            const active = tblPayFilter[opt.k];
                            return (
                              <button key={opt.k} onClick={() => setTblPayFilter(prev => ({ ...prev, [opt.k]: !prev[opt.k] }))}
                                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                                  background: active ? opt.cfg.color : '#F0F2F5',
                                  color: active ? '#FFF' : '#9CA3AF',
                                  boxShadow: active ? 'none' : 'var(--raised-sm)',
                                  opacity: active ? 1 : 0.7,
                                }}>
                                {active ? '✓' : '○'} {opt.l}
                              </button>
                            );
                          })}
                          <button onClick={() => setTblPayFilter({ pending: true, partial: true, paid: true })}
                            style={{ padding: '5px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#F0F2F5', color: '#6B7280', boxShadow: 'var(--raised-sm)', marginLeft: 'auto' }}>
                            Todos
                          </button>
                        </div>
                        {displayedOrdersTable.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 11 }}>
                            {ordersTable.length === 0 ? 'Sin pedidos en este periodo' : 'No hay pedidos con ese estado de pago'}
                          </div>
                        ) : (
                        <div style={{ overflowX: 'auto', marginLeft: -10, marginRight: -10 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 1100 }}>
                            <thead>
                              <tr style={{ background: '#E8EAED' }}>
                                {['Fecha', 'Cliente', 'Producto', 'Cant', 'Costo u.', 'Precio u.', 'Subtotal', 'Abonado', 'Por cobrar', 'Estado', `${config.partner1}`, 'Pag.', `${config.partner2}`, 'Pag.', 'SPLEND.', 'Pag.', 'INVERSIÓN', 'Pag.'].map((h, i) => (
                                  <th key={i} style={{ padding: '6px 6px', textAlign: i === 3 || i > 3 ? 'right' : 'left', fontSize: 8, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {displayedOrdersTable.map((r, idx) => {
                                const psCfg = PAYMENT_STATUS[r.paymentStatus];
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                    <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>{new Date(r.date).toLocaleDateString('es-CO')}</td>
                                    <td style={{ padding: '6px 6px' }}>
                                      <div style={{ fontWeight: 600 }}>{r.customer}</div>
                                      {r.city && <div style={{ fontSize: 9, color: '#9CA3AF' }}>📍 {r.city}</div>}
                                    </td>
                                    <td style={{ padding: '6px 6px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {r.productPhoto ? (
                                          <img src={r.productPhoto} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                                        ) : (
                                          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E5E7EB', flexShrink: 0 }} />
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                          <div>{r.productName}</div>
                                          <div style={{ fontSize: 8, color: '#9CA3AF' }}>{r.productCode}{r.size ? ` · T:${r.size}` : ''}{r.color ? ` · ${r.color}` : ''}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700 }}>{r.qty}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right' }}>{cur(r.costUnit)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right' }}>{cur(r.priceUnit)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700 }}>{cur(r.subtotal)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right', color: '#4A9E6B' }}>{cur(r.paidOfItem)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right', color: r.dueOfItem > 0 ? '#C0504E' : '#9CA3AF' }}>{cur(r.dueOfItem)}</td>
                                    <td style={{ padding: '6px 6px' }}>
                                      <span style={{ padding: '2px 6px', borderRadius: 5, fontSize: 8, fontWeight: 700, color: psCfg.color, background: psCfg.bg, whiteSpace: 'nowrap' }}>{psCfg.icon} {psCfg.label}</span>
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right' }}>{cur(r.commissionS1)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                      <button onClick={() => togglePayout(r.orderId, r.itemIdx, 's1')}
                                        title={r.paidS1 ? 'Marcado como pagado — clic para revertir' : 'Marcar como pagado'}
                                        style={{ border: 'none', cursor: 'pointer', background: r.paidS1 ? '#4A9E6B' : '#F0F2F5', color: r.paidS1 ? '#FFF' : '#9CA3AF', padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, boxShadow: r.paidS1 ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
                                        {r.paidS1 ? '✓' : '○'}
                                      </button>
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right' }}>{cur(r.commissionS2)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                      <button onClick={() => togglePayout(r.orderId, r.itemIdx, 's2')}
                                        title={r.paidS2 ? 'Marcado como pagado — clic para revertir' : 'Marcar como pagado'}
                                        style={{ border: 'none', cursor: 'pointer', background: r.paidS2 ? '#4A9E6B' : '#F0F2F5', color: r.paidS2 ? '#FFF' : '#9CA3AF', padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, boxShadow: r.paidS2 ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
                                        {r.paidS2 ? '✓' : '○'}
                                      </button>
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right', color: '#4A6FA5', fontWeight: 700 }}>{cur(r.splendoraShare)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                      <button onClick={() => togglePayout(r.orderId, r.itemIdx, 'sp')}
                                        title={r.paidSplendora ? 'SPLENDORA recibió — clic para revertir' : 'Marcar como recibido por SPLENDORA'}
                                        style={{ border: 'none', cursor: 'pointer', background: r.paidSplendora ? '#4A6FA5' : '#F0F2F5', color: r.paidSplendora ? '#FFF' : '#9CA3AF', padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, boxShadow: r.paidSplendora ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
                                        {r.paidSplendora ? '✓' : '○'}
                                      </button>
                                    </td>
                                    <td style={{ padding: '6px 6px', textAlign: 'right', color: '#1A1D23', fontWeight: 700 }}>{cur(r.inversion)}</td>
                                    <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                      <button onClick={() => togglePayout(r.orderId, r.itemIdx, 'inv')}
                                        title={r.paidInversion ? 'Inversión recuperada — clic para revertir' : 'Marcar inversión como recuperada'}
                                        style={{ border: 'none', cursor: 'pointer', background: r.paidInversion ? '#1A1D23' : '#F0F2F5', color: r.paidInversion ? '#FFF' : '#9CA3AF', padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, boxShadow: r.paidInversion ? 'none' : 'inset 2px 2px 4px #D1D3D6, inset -2px -2px 4px #FFFFFF' }}>
                                        {r.paidInversion ? '✓' : '○'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* Fila de totales */}
                              <tr style={{ background: '#1A1D23', color: '#FFF', fontWeight: 800 }}>
                                <td colSpan={3} style={{ padding: '10px 6px', textAlign: 'right', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>TOTALES</td>
                                <td style={{ padding: '10px 6px', textAlign: 'right' }}>{ordersTableTotals.qty}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'right' }}>{cur(ordersTableTotals.costTotal)}</td>
                                <td style={{ padding: '10px 6px' }}></td>
                                <td style={{ padding: '10px 6px', textAlign: 'right' }}>{cur(ordersTableTotals.sales)}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'right', color: '#86EFAC' }}>{cur(ordersTableTotals.paid)}</td>
                                <td style={{ padding: '10px 6px', textAlign: 'right', color: '#FCA5A5' }}>{cur(ordersTableTotals.due)}</td>
                                <td style={{ padding: '10px 6px' }}></td>
                                <td style={{ padding: '10px 6px', textAlign: 'right' }}>{cur(ordersTableTotals.s1Total)}</td>
                                <td style={{ padding: '10px 6px' }}></td>
                                <td style={{ padding: '10px 6px', textAlign: 'right' }}>{cur(ordersTableTotals.s2Total)}</td>
                                <td style={{ padding: '10px 6px' }}></td>
                                <td style={{ padding: '10px 6px', textAlign: 'right', color: '#A8C4E0' }}>{cur(ordersTableTotals.splendoraTotal)}</td>
                                <td style={{ padding: '10px 6px' }}></td>
                                <td style={{ padding: '10px 6px', textAlign: 'right' }}>{cur(ordersTableTotals.inversionTotal)}</td>
                                <td style={{ padding: '10px 6px' }}></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── TABLA 2: INVENTARIO ── */}
                  <div style={{ borderRadius: 10, boxShadow: 'var(--raised-sm)', padding: 10, marginBottom: 10 }}>
                    <div onClick={() => toggleDash(setTblInventario, tblInventario, 'tbl_inventario')}
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tblInventario ? 10 : 0, userSelect: 'none' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#1A1D23' }}>📦 Inventario ({visibleProducts.length} activos{archivedProducts.length > 0 ? ` · ${archivedProducts.length} archivados` : ''})</div>
                      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{tblInventario ? '▾' : '▸'}</span>
                    </div>
                    {tblInventario && (() => {
                      // Filtro activo/archivado/todos
                      const filteredInv = tblInvFilter === 'active' ? visibleProducts
                        : tblInvFilter === 'archived' ? archivedProducts
                        : products;
                      const sortedInv = [...filteredInv].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
                      // Totales respetando el filtro elegido
                      const invUnits = filteredInv.reduce((s, p) => s + (p.stock || 0), 0);
                      const invTotalCost = filteredInv.reduce((s, p) => s + (p.cost_total || 0) * (p.stock || 0), 0);
                      const invTotalValue = filteredInv.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0);
                      const invProjProfit = filteredInv.reduce((s, p) => s + ((p.price || 0) - (p.cost_total || 0)) * (p.stock || 0), 0);
                      return (
                        <>
                          {/* Selector de filtro */}
                          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                            {[
                              { k: 'active', l: `Activos (${visibleProducts.length})` },
                              { k: 'archived', l: `Archivados (${archivedProducts.length})` },
                              { k: 'all', l: `Todos (${products.length})` },
                            ].map(opt => (
                              <button key={opt.k} onClick={() => setTblInvFilter(opt.k)}
                                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                                  background: tblInvFilter === opt.k ? '#4A6FA5' : '#F0F2F5',
                                  color: tblInvFilter === opt.k ? '#FFF' : '#6B7280',
                                  boxShadow: tblInvFilter === opt.k ? 'none' : 'var(--raised-sm)',
                                }}>
                                {opt.l}
                              </button>
                            ))}
                          </div>
                          {filteredInv.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 11 }}>Sin productos {tblInvFilter === 'archived' ? 'archivados' : ''}</div>
                          ) : (
                            <div style={{ overflowX: 'auto', marginLeft: -10, marginRight: -10 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 900 }}>
                                <thead>
                                  <tr style={{ background: '#E8EAED' }}>
                                    {['Código', 'Nombre', 'Categorías', 'Tallas', 'Costo u.', 'Precio u.', 'Desc.', 'Stock', 'Inversión', 'Valor venta', 'Estado'].map((h, i) => (
                                      <th key={i} style={{ padding: '6px 6px', textAlign: (i >= 4 && i <= 9) ? 'right' : 'left', fontSize: 8, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedInv.map(p => {
                                    const inv = (p.cost_total || 0) * (p.stock || 0);
                                    const val = (p.price || 0) * (p.stock || 0);
                                    return (
                                      <tr key={p.id} style={{ borderBottom: '1px solid #E5E7EB', opacity: p.archived ? 0.6 : 1 }}>
                                        <td style={{ padding: '6px 6px', fontWeight: 700, color: '#4A6FA5' }}>{p.code}</td>
                                        <td style={{ padding: '6px 6px' }}>{p.name}</td>
                                        <td style={{ padding: '6px 6px', fontSize: 9, color: '#6B7280' }}>{(p.categories || [p.category]).join(', ')}</td>
                                        <td style={{ padding: '6px 6px', fontSize: 9, color: '#6B7280' }}>{(p.sizes || []).join(', ') || p.size || '—'}</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right' }}>{cur(p.cost_total)}</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right' }}>{cur(p.price)}</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right', color: p.discount > 0 ? '#C0504E' : '#9CA3AF' }}>{p.discount || 0}%</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: p.stock === 0 ? '#C0504E' : p.stock <= 2 ? '#D4A843' : '#4A9E6B' }}>{p.stock}</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right', color: '#4A6FA5' }}>{cur(inv)}</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right', color: '#4A9E6B' }}>{cur(val)}</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                          {p.archived ? (
                                            <button onClick={() => {
                                              if (confirm(`¿Reactivar "${p.name}"?\n\nVuelve a aparecer en inventario, catálogo y pedidos nuevos.`)) reactivateProduct(p.id);
                                            }}
                                              style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#4A9E6B', color: '#FFF', borderRadius: 6 }}>
                                              ↻ Reactivar
                                            </button>
                                          ) : (
                                            <span style={{ fontSize: 9, color: '#4A9E6B', fontWeight: 700 }}>● Activo</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  <tr style={{ background: '#1A1D23', color: '#FFF', fontWeight: 800 }}>
                                    <td colSpan={2} style={{ padding: '10px 6px', textAlign: 'right', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>TOTALES · {filteredInv.length} productos</td>
                                    <td style={{ padding: '10px 6px' }}></td>
                                    <td style={{ padding: '10px 6px' }}></td>
                                    <td style={{ padding: '10px 6px' }}></td>
                                    <td style={{ padding: '10px 6px' }}></td>
                                    <td style={{ padding: '10px 6px' }}></td>
                                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>{invUnits}</td>
                                    <td style={{ padding: '10px 6px', textAlign: 'right', color: '#A8C4E0' }}>{cur(invTotalCost)}</td>
                                    <td style={{ padding: '10px 6px', textAlign: 'right', color: '#86EFAC' }}>{cur(invTotalValue)}</td>
                                    <td style={{ padding: '10px 6px' }}></td>
                                  </tr>
                                  <tr style={{ background: '#2D3748', color: '#FFF', fontWeight: 700, fontSize: 9 }}>
                                    <td colSpan={11} style={{ padding: '6px 10px', textAlign: 'center', letterSpacing: 0.3 }}>
                                      Ganancia potencial si se vende todo: <span style={{ color: '#86EFAC', fontWeight: 800 }}>{cur(invProjProfit)}</span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* CATEGORY MANAGEMENT */}
            <div className="neu-card" style={{ marginBottom: 12 }}>
              <div onClick={() => toggleDash(setToolsCategorias, toolsCategorias, 'tools_categorias')}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: toolsCategorias ? 10 : 0, userSelect: 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>🏷 Categorías ({categories.length})</div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>Agrega o quita categorías de productos</div>
                </div>
                <span style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 700 }}>{toolsCategorias ? '▾' : '▸'}</span>
              </div>
              {toolsCategorias && (
                <>
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
                </>
              )}
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
        <OrderForm products={visibleProducts} onSave={async o => { await saveOrder(o); setShowOrd(false); }} />
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
      <Modal open={showEditorial} onClose={() => setShowEditorial(false)} title="📝 Sección Editorial">
        <EditorialForm cfg={editorialCfg} categories={categories} onSave={saveEditorial} />
      </Modal>
      <Modal open={showGallery} onClose={() => setShowGallery(false)} title="🖼️ Sección Gallery" wide>
        <GalleryForm cfg={editorialCfg} categories={categories} onSave={saveGallery} />
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

      {/* Modal "Marcar como enviado" — pide número de guía + empresa, envía email */}
      {shippingModal && (
        <ShippingModal
          order={shippingModal.order}
          oldStatus={shippingModal.oldStatus}
          onClose={() => setShippingModal(null)}
          onConfirm={async ({ trackingNumber, carrier }) => {
            const o = shippingModal.order;
            // 1. Actualizar estado del pedido a "shipped"
            await updateOrderStatus(o.id, 'shipped', o.items, o.status);
            // 2. Llamar al endpoint que guarda guía y envía email
            try {
              await fetch('/api/email/send-shipped', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: o.id, trackingNumber, carrier }),
              });
            } catch (err) {
              console.error('Error enviando email de envío:', err);
            }
            setShippingModal(null);
          }}
        />
      )}

      {/* Toasts de notificación de pedidos nuevos */}
      <ToastsContainer toasts={toasts} onDismiss={dismissToast} onTap={(orderId) => {
        // Al tocar el toast, expandir el pedido y quitar verde
        setExpandedOrders(prev => {
          const next = new Set(prev);
          next.add(orderId);
          return next;
        });
        setUnseenOrders(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        // Cambiar a tab pedidos si no está ya
        setTab('orders');
      }} />
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
    photo_url_2: '', // legacy: se migra a extra_photos al cargar
    extra_photos: [
      // Migración silenciosa: photo_url_2 viejo entra primero al array
      ...(initial.photo_url_2 ? [initial.photo_url_2] : []),
      ...(initial.extra_photos || []),
    ],
    discount: initial.discount || 0, hide_price: initial.hide_price || false,
    is_new: initial.is_new || false,
    variants: initial.variants || null,
  } : {
    name: '', category: 'Blusas', productCategories: [], size: 'M', sizes: [], color: '', colors: [],
    cost_product: 0, cost_bag: 0, cost_shipping: 0, price: 0, stock: 0,
    description: '', photo_url: '', photo_url_2: '', extra_photos: [], discount: 0, hide_price: false, is_new: false,
    variants: { mode: 'size_color', items: [] }, // Nuevo producto: variantes obligatorias
  });

  // Es producto nuevo (no tiene initial)
  const isNewProduct = !initial;

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

  // ── Stock calculado desde variantes (si están activas) ──
  const hasVariants = !!(f.variants && Array.isArray(f.variants.items) && f.variants.items.length > 0);
  const variantStockTotal = hasVariants
    ? f.variants.items.reduce((s, it) => s + (Number(it.stock) || 0), 0)
    : 0;

  // ── Helpers para variantes ──
  function toggleVariants() {
    if (f.variants) {
      // Desactivar: limpiar variantes, dejar stock como estaba
      setF(prev => ({ ...prev, variants: null }));
    } else {
      // Activar: arrancar con modo size_color y una fila vacía
      setF(prev => ({ ...prev, variants: { mode: 'size_color', items: [] } }));
    }
  }

  function changeVariantMode(newMode) {
    setF(prev => ({
      ...prev,
      variants: { mode: newMode, items: (prev.variants?.items || []).map(it => ({
        size: newMode === 'color_only' ? null : (it.size || ''),
        color: newMode === 'size_only' ? null : (it.color || ''),
        stock: it.stock || 0,
      })) },
    }));
  }

  function addVariant() {
    const mode = f.variants?.mode || 'size_color';
    const newItem = {
      size: mode === 'color_only' ? null : '',
      color: mode === 'size_only' ? null : '',
      stock: 0,
    };
    setF(prev => ({ ...prev, variants: { ...prev.variants, items: [...(prev.variants?.items || []), newItem] } }));
  }

  function updateVariant(idx, field, value) {
    setF(prev => ({
      ...prev,
      variants: {
        ...prev.variants,
        items: prev.variants.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
      },
    }));
  }

  function removeVariant(idx) {
    setF(prev => ({
      ...prev,
      variants: {
        ...prev.variants,
        items: prev.variants.items.filter((_, i) => i !== idx),
      },
    }));
  }

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
      {/* PHOTO UPLOADS — Grid de 5 slots estilo Shopify */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Fotos del producto (máx 5)</label>

        {(() => {
          // Combinar todas las fotos en un solo array: [photo_url, ...extra_photos]
          // photo_url_2 (legacy) ya se migró al cargar el form
          const allPhotos = [
            ...(f.photo_url ? [f.photo_url] : []),
            ...(f.extra_photos || []),
          ];
          const maxPhotos = 5;
          const emptySlots = Math.max(0, maxPhotos - allPhotos.length);

          // Setear todas las fotos desde un array
          function setAllPhotos(arr) {
            const clean = arr.filter(Boolean).slice(0, maxPhotos);
            setF(prev => ({
              ...prev,
              photo_url: clean[0] || '',
              extra_photos: clean.slice(1),
              photo_url_2: '', // limpiar legacy
            }));
          }

          function removePhotoAt(i) {
            const next = allPhotos.filter((_, j) => j !== i);
            setAllPhotos(next);
          }

          function makeMain(i) {
            if (i === 0) return;
            const next = [...allPhotos];
            const [chosen] = next.splice(i, 1);
            next.unshift(chosen);
            setAllPhotos(next);
          }

          async function handleAddPhoto(e) {
            const file = e.target.files?.[0];
            if (!file) return;
            if (allPhotos.length >= maxPhotos) {
              alert(`Máximo ${maxPhotos} fotos por producto`);
              return;
            }
            setUploading(true);
            try {
              const url = await uploadPhoto(file);
              setAllPhotos([...allPhotos, url]);
            } catch (err) {
              alert('Error al subir foto: ' + err.message);
            }
            setUploading(false);
            if (refExtra.current) refExtra.current.value = '';
          }

          return (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                gap: 8,
                marginBottom: 8,
              }}>
                {/* Slots con foto */}
                {allPhotos.map((url, i) => (
                  <div key={i} style={{
                    aspectRatio: '1',
                    borderRadius: 10,
                    overflow: 'hidden',
                    position: 'relative',
                    boxShadow: 'var(--raised-sm)',
                  }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                    {/* Badge PRINCIPAL en la primera */}
                    {i === 0 && (
                      <span style={{
                        position: 'absolute', top: 4, left: 4,
                        background: '#1A1D23', color: '#FFF',
                        fontSize: 7, fontWeight: 800,
                        padding: '2px 6px', borderRadius: 3,
                        letterSpacing: 0.5,
                      }}>PRINCIPAL</span>
                    )}

                    {/* Botón borrar */}
                    <button
                      type="button"
                      onClick={() => removePhotoAt(i)}
                      title="Borrar foto"
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.75)', color: '#FFF',
                        border: 'none', cursor: 'pointer',
                        fontSize: 11, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>✕</button>

                    {/* Botón "Hacer principal" si no es la primera */}
                    {i !== 0 && (
                      <button
                        type="button"
                        onClick={() => makeMain(i)}
                        title="Marcar como foto principal"
                        style={{
                          position: 'absolute', bottom: 4, left: 4, right: 4,
                          background: 'rgba(255,255,255,0.92)', color: '#1A1D23',
                          border: 'none', borderRadius: 4,
                          padding: '3px 6px', fontSize: 9, fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: "'Montserrat', sans-serif",
                        }}>↑ Principal</button>
                    )}
                  </div>
                ))}

                {/* Slot "+ Agregar" si quedan espacios */}
                {emptySlots > 0 && (
                  <div
                    onClick={() => !uploading && refExtra.current?.click()}
                    style={{
                      aspectRatio: '1',
                      border: '2px dashed #D1D5DB',
                      borderRadius: 10,
                      background: '#FAFAFA',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9CA3AF',
                      fontSize: 10,
                      transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: 24, fontWeight: 300, lineHeight: 1 }}>+</span>
                    <span style={{ marginTop: 4 }}>{uploading ? 'Subiendo...' : 'Agregar'}</span>
                  </div>
                )}
              </div>

              <input
                ref={refExtra}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAddPhoto}
              />

              <div style={{ fontSize: 9, color: '#9CA3AF', textAlign: 'center', marginTop: 4 }}>
                {allPhotos.length} de {maxPhotos} fotos · La primera es la principal
              </div>
            </>
          );
        })()}
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

      {/* MULTIPLE COLORS — solo para productos VIEJOS (los nuevos usan variantes) */}
      {!isNewProduct && (
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
      )}

      {/* MULTIPLE SIZES — solo para productos VIEJOS */}
      {!isNewProduct && (
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
      )}

      <div className="label">Costos</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Fld label="Producto $"><input className="neu-input" type="number" value={f.cost_product} onChange={e => setF({ ...f, cost_product: Number(e.target.value) })} /></Fld>
        <Fld label="Bolsa $"><input className="neu-input" type="number" value={f.cost_bag} onChange={e => setF({ ...f, cost_bag: Number(e.target.value) })} /></Fld>
        <Fld label="Envío $"><input className="neu-input" type="number" value={f.cost_shipping} onChange={e => setF({ ...f, cost_shipping: Number(e.target.value) })} /></Fld>
      </div>
      <div className="neu-card neu-pressed" style={{ textAlign: 'center', padding: 10, marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>Costo total: {cur(ct)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isNewProduct ? '1fr' : '1fr 1fr', gap: 12 }}>
        <Fld label="Precio venta"><input className="neu-input" type="number" value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) })} /></Fld>
        {!isNewProduct && (
          <Fld label={hasVariants ? "Stock total (auto)" : "Stock"}>
            <input className="neu-input" type="number"
              value={hasVariants ? variantStockTotal : f.stock}
              onChange={e => setF({ ...f, stock: Number(e.target.value) })}
              disabled={hasVariants}
              style={hasVariants ? { background: '#F0F2F5', color: '#6B7280', cursor: 'not-allowed' } : {}} />
          </Fld>
        )}
      </div>

      {/* ── BLOQUE DE VARIANTES ── */}
      {/* Para productos nuevos: variantes obligatorias, sin switch */}
      {/* Para productos viejos: switch como antes */}
      {isNewProduct ? (
        <div style={{ marginBottom: 14, padding: 12, background: '#F0F7FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D23', marginBottom: 2 }}>
            Stock por variantes (talla / color)
          </div>
          <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 12 }}>
            Llena el stock por cada combinación. El total se calcula solo.
          </div>

          {/* Selector de modo */}
          <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Modo</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { v: 'size_color', l: 'Talla + Color' },
              { v: 'size_only', l: 'Solo talla' },
              { v: 'color_only', l: 'Solo color' },
            ].map(m => (
              <button key={m.v} type="button" onClick={() => changeVariantMode(m.v)}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: f.variants?.mode === m.v ? '#4A6FA5' : '#FFF',
                  color: f.variants?.mode === m.v ? '#FFF' : '#6B7280',
                  boxShadow: f.variants?.mode === m.v ? 'none' : 'var(--raised-sm)',
                }}>{m.l}</button>
            ))}
          </div>

          {/* Lista de variantes */}
          {(!f.variants?.items || f.variants.items.length === 0) && (
            <div style={{ textAlign: 'center', padding: 14, color: '#9CA3AF', fontSize: 11 }}>
              Aún no hay variantes. Agrega la primera.
            </div>
          )}

          {f.variants?.items?.map((it, idx) => (
            <div key={idx} style={{
              display: 'grid',
              gridTemplateColumns: f.variants.mode === 'size_color'
                ? 'minmax(0, 1fr) minmax(0, 1.2fr) 60px 28px'
                : 'minmax(0, 1fr) 70px 28px',
              gap: 4, marginBottom: 6, alignItems: 'center',
            }}>
              {f.variants.mode !== 'color_only' && (
                <input
                  placeholder="Talla"
                  value={it.size || ''}
                  onChange={e => updateVariant(idx, 'size', e.target.value)}
                  style={{ minWidth: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }}
                />
              )}
              {f.variants.mode !== 'size_only' && (
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#FFF', boxSizing: 'border-box' }}>
                  {it.color && <ColorDot name={it.color} size={12} />}
                  <input
                    placeholder="Color"
                    value={it.color || ''}
                    onChange={e => updateVariant(idx, 'color', e.target.value)}
                    style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 11, fontFamily: 'inherit', background: 'transparent', width: '100%' }}
                  />
                </div>
              )}
              <input
                type="number"
                placeholder="Stock"
                value={it.stock}
                onChange={e => updateVariant(idx, 'stock', Number(e.target.value))}
                style={{ minWidth: 0, padding: '6px 4px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box', width: '100%' }}
              />
              <button type="button" onClick={() => removeVariant(idx)}
                style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0, flexShrink: 0 }}>✕</button>
            </div>
          ))}

          <button type="button" onClick={addVariant}
            style={{ width: '100%', marginTop: 8, padding: '8px', background: '#FFF', color: '#4A6FA5', border: '1px dashed #4A6FA5', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
            + Agregar variante
          </button>

          {variantStockTotal > 0 && (
            <div style={{ marginTop: 10, padding: 8, background: '#FFF', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#4A6FA5' }}>
              Stock total: {variantStockTotal} unidades
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 14, padding: 12, background: f.variants ? '#F0F7FF' : '#F9FAFB', borderRadius: 8, border: f.variants ? '1px solid #BFDBFE' : '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={toggleVariants}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D23' }}>
              {f.variants ? '✓ Stock por variantes activado' : '☐ Manejar stock por variantes (talla/color)'}
            </div>
            <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
              {f.variants
                ? 'Llena el stock por cada combinación. El total se calcula solo.'
                : 'Actívalo si quieres controlar stock por talla, color o combinación.'}
            </div>
          </div>
          <div style={{
            width: 36, height: 20, borderRadius: 12,
            background: f.variants ? '#4A6FA5' : '#D1D5DB',
            position: 'relative', flexShrink: 0,
            transition: 'background 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: f.variants ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%', background: '#FFF',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
            }} />
          </div>
        </div>

        {f.variants && (
          <div style={{ marginTop: 12 }}>
            {/* Selector de modo */}
            <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Modo</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { v: 'size_color', l: 'Talla + Color' },
                { v: 'size_only', l: 'Solo talla' },
                { v: 'color_only', l: 'Solo color' },
              ].map(m => (
                <button key={m.v} type="button" onClick={() => changeVariantMode(m.v)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: f.variants.mode === m.v ? '#4A6FA5' : '#FFF',
                    color: f.variants.mode === m.v ? '#FFF' : '#6B7280',
                    boxShadow: f.variants.mode === m.v ? 'none' : 'var(--raised-sm)',
                  }}>{m.l}</button>
              ))}
            </div>

            {/* Lista de variantes */}
            {f.variants.items.length === 0 && (
              <div style={{ textAlign: 'center', padding: 14, color: '#9CA3AF', fontSize: 11 }}>
                Aún no hay variantes. Agrega la primera.
              </div>
            )}

            {f.variants.items.map((it, idx) => (
              <div key={idx} style={{
                display: 'grid',
                gridTemplateColumns: f.variants.mode === 'size_color'
                  ? 'minmax(0, 1fr) minmax(0, 1.2fr) 60px 28px'
                  : 'minmax(0, 1fr) 70px 28px',
                gap: 4, marginBottom: 6, alignItems: 'center',
              }}>
                {f.variants.mode !== 'color_only' && (
                  <input
                    placeholder="Talla"
                    value={it.size || ''}
                    onChange={e => updateVariant(idx, 'size', e.target.value)}
                    style={{ minWidth: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }}
                  />
                )}
                {f.variants.mode !== 'size_only' && (
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#FFF', boxSizing: 'border-box' }}>
                    {it.color && <ColorDot name={it.color} size={12} />}
                    <input
                      placeholder="Color"
                      value={it.color || ''}
                      onChange={e => updateVariant(idx, 'color', e.target.value)}
                      style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 11, fontFamily: 'inherit', background: 'transparent', width: '100%' }}
                    />
                  </div>
                )}
                <input
                  type="number"
                  placeholder="Stock"
                  value={it.stock}
                  onChange={e => updateVariant(idx, 'stock', Number(e.target.value))}
                  style={{ minWidth: 0, padding: '6px 4px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box', width: '100%' }}
                />
                <button type="button" onClick={() => removeVariant(idx)}
                  style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0, flexShrink: 0 }}>✕</button>
              </div>
            ))}

            <button type="button" onClick={addVariant}
              style={{ width: '100%', marginTop: 8, padding: '8px', background: '#FFF', color: '#4A6FA5', border: '1px dashed #4A6FA5', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
              + Agregar variante
            </button>

            {variantStockTotal > 0 && (
              <div style={{ marginTop: 10, padding: 8, background: '#FFF', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#4A6FA5' }}>
                Stock total: {variantStockTotal} unidades
              </div>
            )}
          </div>
        )}
      </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Fld label="Descuento %"><input className="neu-input" type="number" min="0" max="99" value={f.discount} onChange={e => setF({ ...f, discount: Number(e.target.value) })} /></Fld>
        <Fld label="¿Ocultar precio?">
          <button type="button" className="neu-btn" style={{ width: '100%', ...(f.hide_price ? { background: '#4A6FA5', color: '#FFF' } : {}) }}
            onClick={() => setF({ ...f, hide_price: !f.hide_price })}>
            {f.hide_price ? 'Sí' : 'No'}
          </button>
        </Fld>
        <Fld label="Marcar NUEVO">
          <button type="button" className="neu-btn" style={{ width: '100%', ...(f.is_new ? { background: '#1A1D23', color: '#FFF' } : {}) }}
            onClick={() => setF({ ...f, is_new: !f.is_new })}>
            {f.is_new ? '⭐ Sí' : 'No'}
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

          // Validar variantes si están activas (switch ON)
          if (f.variants !== null) {
            if (!f.variants.items || f.variants.items.length === 0) {
              return alert('Activaste variantes pero no agregaste ninguna. Agrega al menos una o desactiva el switch.');
            }
            for (let i = 0; i < f.variants.items.length; i++) {
              const it = f.variants.items[i];
              if (f.variants.mode !== 'color_only' && !it.size) {
                return alert(`La variante #${i + 1} no tiene talla.`);
              }
              if (f.variants.mode !== 'size_only' && !it.color) {
                return alert(`La variante #${i + 1} no tiene color.`);
              }
              if (Number(it.stock) < 0) {
                return alert(`La variante #${i + 1} tiene stock negativo.`);
              }
            }
            // Detectar duplicados
            const seen = new Set();
            for (const it of f.variants.items) {
              const key = `${it.size || ''}|${it.color || ''}`;
              if (seen.has(key)) {
                return alert(`Tienes variantes duplicadas: ${it.size || ''} ${it.color || ''}`);
              }
              seen.add(key);
            }
          }

          // Stock final: si hay variantes, usar suma; si no, usar el campo simple
          const finalStock = hasVariants ? variantStockTotal : (Number(f.stock) || 0);
          onSave({
            ...f,
            stock: finalStock,
            cost_total: ct,
            categories: f.productCategories,
            category: f.productCategories[0],
            variants: hasVariants ? f.variants : null,
          });
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
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>División fija (modelo oficial)</div>
        <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.6 }}>
          📢 20% Ads · 🏷 10% Marca<br/>
          {c.partner1} (35%) · {c.partner2} (35%)
        </div>
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
  const shareRef = useRef(null);

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

      {/* SHARE PREVIEW IMAGE */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Imagen de preview (al compartir link del catálogo)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div onClick={() => shareRef.current?.click()} style={{
            width: 160, height: 84, borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: c.share_image_url ? 'var(--raised-sm)' : 'var(--pressed)',
          }}>
            {c.share_image_url
              ? <img src={c.share_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ color: '#9CA3AF', fontSize: 10, textAlign: 'center', padding: 4 }}>{uploading ? '...' : '+ Subir imagen'}</div>
            }
          </div>
          <input ref={shareRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUpload('share_image_url', e)} />
          {c.share_image_url && <button className="neu-btn neu-btn-sm" onClick={() => setC({ ...c, share_image_url: '' })}>Quitar</button>}
        </div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6, lineHeight: 1.4 }}>
          📲 Esta foto aparece cuando compartes el link del catálogo en WhatsApp, Instagram, etc.<br/>
          Tamaño recomendado: 1200×630 px (horizontal).
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

// ════════════════════════════════════════════════════════════
// CUSTOMERS SECTION — Lista de clientes para email marketing
// ════════════════════════════════════════════════════════════
function CustomersSection({ emailList, filter, setFilter, search, setSearch, cityFilter, setCityFilter }) {
  // Stats globales
  const totalCustomers = emailList.length;
  const optInCount = emailList.filter(c => c.marketing_optin).length;
  const recurringCount = emailList.filter(c => (c.total_orders || 0) >= 2).length;
  const totalRevenue = emailList.reduce((s, c) => s + (Number(c.total_spent) || 0), 0);
  const avgTicket = totalCustomers > 0 ? totalRevenue / emailList.reduce((s, c) => s + (c.total_orders || 0), 0 || 1) : 0;

  // Ciudades únicas para el filtro
  const cities = [...new Set(emailList.map(c => c.city).filter(Boolean))].sort();

  // Aplicar filtros
  const filtered = emailList.filter(c => {
    if (filter === 'optin' && !c.marketing_optin) return false;
    if (filter === 'recurring' && (c.total_orders || 0) < 2) return false;
    if (cityFilter && c.city !== cityFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const matchName = (c.name || '').toLowerCase().includes(s);
      const matchEmail = (c.email || '').toLowerCase().includes(s);
      const matchPhone = (c.phone || '').includes(s);
      if (!matchName && !matchEmail && !matchPhone) return false;
    }
    return true;
  });

  // Exportar CSV
  function exportCSV() {
    if (filtered.length === 0) {
      alert('No hay clientes para exportar con los filtros actuales');
      return;
    }
    const headers = ['Email', 'Nombre', 'Telefono', 'Ciudad', 'Acepta Marketing', 'Pedidos', 'Total Gastado', 'Primera Compra', 'Ultima Compra'];
    const rows = filtered.map(c => [
      c.email || '',
      (c.name || '').replace(/"/g, '""'),
      c.phone || '',
      (c.city || '').replace(/"/g, '""'),
      c.marketing_optin ? 'Sí' : 'No',
      c.total_orders || 0,
      Math.round(Number(c.total_spent) || 0),
      c.first_order_date ? new Date(c.first_order_date).toLocaleDateString('es-CO') : '',
      c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('es-CO') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `splendora-clientes-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cur = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

  return (
    <div>
      <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800 }}>Clientes</h2>

      {/* Estadísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
        <div className="neu-card neu-pressed" style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Total clientes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1D23', marginTop: 4 }}>{totalCustomers}</div>
        </div>
        <div className="neu-card neu-pressed" style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Acepta marketing</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981', marginTop: 4 }}>{optInCount}</div>
        </div>
        <div className="neu-card neu-pressed" style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Recurrentes (2+)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#4A6FA5', marginTop: 4 }}>{recurringCount}</div>
        </div>
        <div className="neu-card neu-pressed" style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Ticket promedio</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D23', marginTop: 4 }}>{cur(avgTicket)}</div>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="neu-card" style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nombre, email o teléfono..."
          style={{
            width: '100%', padding: 10, border: 'none', borderRadius: 8,
            background: '#F0F2F5', fontSize: 12, marginBottom: 10,
            boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
            fontFamily: "'Montserrat', sans-serif",
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'optin', label: '✓ Acepta marketing' },
            { id: 'recurring', label: 'Recurrentes' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 700,
                background: filter === opt.id ? '#1A1D23' : '#F0F2F5',
                color: filter === opt.id ? '#FFF' : '#6B7280',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                boxShadow: filter === opt.id ? 'none' : 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
                fontFamily: "'Montserrat', sans-serif",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        {cities.length > 0 && (
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            style={{
              width: '100%', padding: 10, border: 'none', borderRadius: 8,
              background: '#F0F2F5', fontSize: 12, marginBottom: 10,
              boxShadow: 'inset 3px 3px 6px #D1D3D6, inset -3px -3px 6px #FFFFFF',
              fontFamily: "'Montserrat', sans-serif",
            }}>
            <option value="">Todas las ciudades</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button
          className="neu-btn neu-btn-accent"
          style={{ width: '100%' }}
          onClick={exportCSV}>
          ⬇ Exportar CSV ({filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'})
        </button>
      </div>

      {/* Lista de clientes */}
      {filtered.length === 0 ? (
        <div className="neu-card neu-pressed" style={{ padding: 20, textAlign: 'center', color: '#6B7280', fontSize: 12 }}>
          {emailList.length === 0
            ? 'Aún no hay clientes registrados. Aparecerán automáticamente cuando se confirme un pago.'
            : 'No hay clientes con los filtros seleccionados.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(c => (
            <div key={c.id} className="neu-card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                    {c.name || '(sin nombre)'}
                    {c.marketing_optin && (
                      <span style={{ marginLeft: 6, padding: '2px 6px', background: '#D1FAE5', color: '#065F46', fontSize: 9, fontWeight: 700, borderRadius: 4 }}>✓ MKT</span>
                    )}
                    {(c.total_orders || 0) >= 2 && (
                      <span style={{ marginLeft: 4, padding: '2px 6px', background: '#DBEAFE', color: '#1E40AF', fontSize: 9, fontWeight: 700, borderRadius: 4 }}>RECURRENTE</span>
                    )}
                  </div>
                  <a href={`mailto:${c.email}`} style={{ fontSize: 11, color: '#4A6FA5', textDecoration: 'none', display: 'block', marginBottom: 2 }}>
                    📧 {c.email}
                  </a>
                  {c.phone && (
                    <a href={`https://wa.me/${(c.phone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#25D366', textDecoration: 'none', display: 'block', marginBottom: 2 }}>
                      💬 {c.phone}
                    </a>
                  )}
                  {c.city && <div style={{ fontSize: 10, color: '#6B7280' }}>📍 {c.city}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1D23' }}>{cur(c.total_spent)}</div>
                  <div style={{ fontSize: 10, color: '#6B7280' }}>{c.total_orders} {c.total_orders === 1 ? 'pedido' : 'pedidos'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9CA3AF', borderTop: '1px solid #E5E7EB', paddingTop: 6 }}>
                <span>1ª compra: {c.first_order_date ? new Date(c.first_order_date).toLocaleDateString('es-CO') : '—'}</span>
                <span>Última: {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('es-CO') : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SHIPPING MODAL — pide número de guía y empresa al marcar enviado
// ════════════════════════════════════════════════════════════
function ShippingModal({ order, oldStatus, onClose, onConfirm }) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('Interrapidísimo');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!trackingNumber.trim()) {
      alert('Ingresa el número de guía');
      return;
    }
    setSubmitting(true);
    await onConfirm({ trackingNumber: trackingNumber.trim(), carrier });
    setSubmitting(false);
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Montserrat', sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
            PEDIDO #{order.order_number || order.id?.slice(0, 8)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1D23' }}>Marcar como enviado</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, lineHeight: 1.5 }}>
            Ingresa el número de guía. Le enviaremos un email a <strong>{order.customer_name}</strong> con el rastreo del pedido.
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Empresa de envío
            </label>
            <select
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              disabled={submitting}
              style={{
                width: '100%', padding: '11px 12px', border: '1px solid #E5E7EB', borderRadius: 8,
                fontSize: 13, background: '#FFF', fontFamily: "'Montserrat', sans-serif",
                cursor: 'pointer',
              }}>
              <option value="Interrapidísimo">Interrapidísimo</option>
              <option value="Servientrega">Servientrega</option>
              <option value="Coordinadora">Coordinadora</option>
              <option value="TCC">TCC</option>
              <option value="Otra">Otra empresa</option>
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Número de guía
            </label>
            <input
              type="text"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="Ej. 240017889234"
              disabled={submitting}
              autoFocus
              style={{
                width: '100%', padding: '11px 12px', border: '1px solid #E5E7EB', borderRadius: 8,
                fontSize: 13, fontFamily: "'Montserrat', sans-serif",
              }}
            />
          </div>

          {!order.customer_email && (
            <div style={{ background: '#FEF3C7', color: '#92400E', padding: '10px 12px', borderRadius: 8, fontSize: 11, marginBottom: 16 }}>
              ⚠ Este pedido no tiene email del cliente. Se marcará como enviado pero NO se enviará email.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1, padding: '12px', background: '#F0F2F5', color: '#6B7280',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: "'Montserrat', sans-serif",
              }}>
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !trackingNumber.trim()}
              style={{
                flex: 2, padding: '12px', background: '#1A1D23', color: '#FFF',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: (submitting || !trackingNumber.trim()) ? 'not-allowed' : 'pointer',
                fontFamily: "'Montserrat', sans-serif",
                opacity: (submitting || !trackingNumber.trim()) ? 0.6 : 1,
              }}>
              {submitting ? 'Enviando...' : 'Confirmar y notificar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TOASTS — notificaciones flotantes de pedidos nuevos (estilo Rappi)
// ════════════════════════════════════════════════════════════
function ToastsContainer({ toasts, onDismiss, onTap }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 16, zIndex: 1300,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
      maxWidth: 340,
    }}>
      {toasts.map(t => (
        <div key={t.id}
          onClick={() => onTap(t.orderId)}
          style={{
            background: '#1A1D23', color: '#FFF',
            padding: '12px 14px', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer', pointerEvents: 'auto',
            animation: 'splendora-toast-in 0.3s ease-out',
            fontFamily: "'Montserrat', sans-serif",
          }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#10B981', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🛍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#10B981', letterSpacing: 1 }}>
              NUEVO PEDIDO {t.orderNumber ? `#${t.orderNumber}` : ''}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.customerName || 'Cliente'}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
              ${Math.round(Number(t.total) || 0).toLocaleString('es-CO')} · {t.time.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }}
            style={{
              background: 'transparent', border: 'none', color: '#9CA3AF',
              fontSize: 16, cursor: 'pointer', padding: 4,
              flexShrink: 0,
            }}>✕</button>
        </div>
      ))}
      <style>{`
        @keyframes splendora-toast-in {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FORM: EditorialForm — Configura la sección Quote Editorial
// del final del catálogo.
// ═══════════════════════════════════════════════════════════════
function EditorialForm({ cfg, categories, onSave }) {
  const [f, setF] = useState({
    enabled: cfg.enabled || false,
    quote_text: cfg.quote_text || '',
    photos: cfg.photos || [],
    cta_text: cfg.cta_text || 'Ver más',
    cta_type: cfg.cta_type || 'none',
    cta_value: cfg.cta_value || '',
  });
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef(null);

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if ((f.photos || []).length >= 4) {
      alert('Máximo 4 fotos en la sección editorial');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setF(prev => ({ ...prev, photos: [...(prev.photos || []), url] }));
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setUploading(false);
    if (photoRef.current) photoRef.current.value = '';
  }

  function removePhoto(i) {
    setF(prev => ({ ...prev, photos: prev.photos.filter((_, j) => j !== i) }));
  }

  return (
    <div>
      {/* Toggle activar / desactivar */}
      <div style={{
        marginBottom: 16, padding: 12, borderRadius: 10,
        background: f.enabled ? '#D1FAE5' : '#FEE2E2',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: f.enabled ? '#065F46' : '#991B1B' }}>
              {f.enabled ? '✓ SECCIÓN ACTIVA' : '✕ Sección desactivada'}
            </div>
            <div style={{ fontSize: 9, color: f.enabled ? '#065F46' : '#991B1B', marginTop: 2 }}>
              {f.enabled ? 'Visible al final del catálogo' : 'No se muestra en el catálogo'}
            </div>
          </div>
          <button
            type="button"
            className="neu-btn neu-btn-sm"
            style={{ background: f.enabled ? '#1A1D23' : '#10B981', color: '#FFF' }}
            onClick={() => setF({ ...f, enabled: !f.enabled })}>
            {f.enabled ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>

      {/* Frase principal */}
      <Fld label="Frase principal">
        <textarea
          className="neu-input"
          rows={3}
          placeholder="Ej: Cada pieza está pensada para hacerte sentir auténtica"
          value={f.quote_text}
          onChange={e => setF({ ...f, quote_text: e.target.value })}
          style={{ resize: 'vertical', minHeight: 60, fontFamily: "'Montserrat', sans-serif" }}
        />
        <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>
          Recomendado: 30-80 caracteres. Usa salto de línea con Enter.
        </div>
      </Fld>

      {/* 4 fotos */}
      <div style={{ marginBottom: 16 }}>
        <label className="label">Fotos pequeñas (máx 4)</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          marginBottom: 8,
        }}>
          {(f.photos || []).map((url, i) => (
            <div key={i} style={{
              aspectRatio: '1',
              borderRadius: 8,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'var(--raised-sm)',
            }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.75)', color: '#FFF',
                  border: 'none', cursor: 'pointer', fontSize: 10,
                }}>✕</button>
            </div>
          ))}
          {(f.photos || []).length < 4 && (
            <div
              onClick={() => !uploading && photoRef.current?.click()}
              style={{
                aspectRatio: '1',
                border: '2px dashed #D1D5DB',
                borderRadius: 8,
                cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: '#9CA3AF',
                background: '#FAFAFA',
              }}>{uploading ? '...' : '+'}</div>
          )}
        </div>
        <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAddPhoto} />
        <div style={{ fontSize: 9, color: '#9CA3AF', textAlign: 'center' }}>
          {(f.photos || []).length} de 4 fotos
        </div>
      </div>

      {/* Texto del botón */}
      <Fld label="Texto del botón">
        <input
          className="neu-input"
          placeholder="Ej: Ver Primavera"
          value={f.cta_text}
          onChange={e => setF({ ...f, cta_text: e.target.value })}
        />
      </Fld>

      {/* Tipo de link */}
      <Fld label="¿A dónde lleva el botón?">
        <select
          className="neu-input"
          value={f.cta_type}
          onChange={e => setF({ ...f, cta_type: e.target.value, cta_value: '' })}>
          <option value="none">Sin link (solo decorativo)</option>
          <option value="url">URL externa (ej: Instagram)</option>
          <option value="category">Filtrar por categoría del catálogo</option>
        </select>
      </Fld>

      {/* Campo según tipo */}
      {f.cta_type === 'url' && (
        <Fld label="URL completa">
          <input
            className="neu-input"
            type="url"
            placeholder="https://instagram.com/splendoracol"
            value={f.cta_value}
            onChange={e => setF({ ...f, cta_value: e.target.value })}
          />
        </Fld>
      )}

      {f.cta_type === 'category' && (
        <Fld label="Categoría">
          <select
            className="neu-input"
            value={f.cta_value}
            onChange={e => setF({ ...f, cta_value: e.target.value })}>
            <option value="">Selecciona una categoría</option>
            {(categories || []).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>
            Al hacer clic, el catálogo se filtra por esta categoría.
          </div>
        </Fld>
      )}

      {/* Vista previa */}
      <div style={{
        marginTop: 18, padding: 14,
        background: '#FAF8F5', borderRadius: 12,
        border: '1px solid #E5E7EB',
      }}>
        <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Vista previa</div>
        {f.quote_text ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 32, color: '#C0506F', fontFamily: 'Georgia, serif', lineHeight: 0.5, marginBottom: 12 }}>"</div>
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 16, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{f.quote_text}</div>
            {(f.photos || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${f.photos.length}, 1fr)`, gap: 4, marginTop: 12 }}>
                {f.photos.map((url, i) => (
                  <div key={i} style={{ aspectRatio: '1', borderRadius: 3, overflow: 'hidden' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
            {f.cta_text && f.cta_type !== 'none' && (
              <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, textDecoration: 'underline', color: '#1A1D23' }}>
                {f.cta_text} →
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', padding: 16 }}>
            Llena la frase para ver la vista previa
          </div>
        )}
      </div>

      <button
        type="button"
        className="neu-btn neu-btn-accent"
        style={{ width: '100%', marginTop: 16, padding: 12 }}
        onClick={() => onSave(f)}>
        💾 Guardar sección editorial
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FORM: GalleryForm — Configura la sección Gallery editorial
// (estilo Bo+Tee) del final del catálogo. Layout asimétrico
// con palabra grande + 8 fotos.
// ═══════════════════════════════════════════════════════════════
function GalleryForm({ cfg, categories, onSave }) {
  const [f, setF] = useState({
    gallery_enabled: cfg.gallery_enabled || false,
    gallery_word: cfg.gallery_word || '',
    gallery_subtitle: cfg.gallery_subtitle || '',
    gallery_photos: cfg.gallery_photos || [],
    gallery_cta_text: cfg.gallery_cta_text || 'Ver más',
    gallery_cta_type: cfg.gallery_cta_type || 'none',
    gallery_cta_value: cfg.gallery_cta_value || '',
  });
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef(null);

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if ((f.gallery_photos || []).length >= 8) {
      alert('Máximo 8 fotos en la sección gallery');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setF(prev => ({ ...prev, gallery_photos: [...(prev.gallery_photos || []), url] }));
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setUploading(false);
    if (photoRef.current) photoRef.current.value = '';
  }

  function removePhoto(i) {
    setF(prev => ({ ...prev, gallery_photos: prev.gallery_photos.filter((_, j) => j !== i) }));
  }

  return (
    <div>
      <div style={{
        marginBottom: 16, padding: 12, borderRadius: 10,
        background: f.gallery_enabled ? '#D1FAE5' : '#FEE2E2',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: f.gallery_enabled ? '#065F46' : '#991B1B' }}>
              {f.gallery_enabled ? '✓ SECCIÓN ACTIVA' : '✕ Sección desactivada'}
            </div>
            <div style={{ fontSize: 9, color: f.gallery_enabled ? '#065F46' : '#991B1B', marginTop: 2 }}>
              {f.gallery_enabled ? 'Visible al final del catálogo (después de la editorial)' : 'No se muestra en el catálogo'}
            </div>
          </div>
          <button
            type="button"
            className="neu-btn neu-btn-sm"
            style={{ background: f.gallery_enabled ? '#1A1D23' : '#10B981', color: '#FFF' }}
            onClick={() => setF({ ...f, gallery_enabled: !f.gallery_enabled })}>
            {f.gallery_enabled ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>

      <Fld label="Palabra grande (titular)">
        <input
          className="neu-input"
          placeholder="Ej: Bloom, Glow, Move, Power"
          value={f.gallery_word}
          onChange={e => setF({ ...f, gallery_word: e.target.value })}
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 18 }}
        />
        <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>
          1 palabra corta y aspiracional. Se ve en serif italic gigante.
        </div>
      </Fld>

      <Fld label="Frase debajo de la palabra (opcional)">
        <textarea
          className="neu-input"
          rows={2}
          placeholder="Ej: Nueva colección. Pensada para moverse."
          value={f.gallery_subtitle}
          onChange={e => setF({ ...f, gallery_subtitle: e.target.value })}
          style={{ resize: 'vertical', minHeight: 50, fontFamily: 'Georgia, serif' }}
        />
        <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>
          Recomendado: 5-15 palabras. Opcional, puede quedar vacío.
        </div>
      </Fld>

      <div style={{ marginBottom: 16 }}>
        <label className="label">Fotos editoriales (máx 8)</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          marginBottom: 8,
        }}>
          {(f.gallery_photos || []).map((url, i) => (
            <div key={i} style={{
              aspectRatio: '3/4',
              borderRadius: 6,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'var(--raised-sm)',
            }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.75)', color: '#FFF',
                  border: 'none', cursor: 'pointer', fontSize: 10,
                }}>✕</button>
              <div style={{
                position: 'absolute', bottom: 2, left: 2,
                fontSize: 8, fontWeight: 700, color: '#FFF',
                background: 'rgba(0,0,0,0.5)', padding: '1px 5px', borderRadius: 3,
              }}>{i + 1}</div>
            </div>
          ))}
          {(f.gallery_photos || []).length < 8 && (
            <div
              onClick={() => !uploading && photoRef.current?.click()}
              style={{
                aspectRatio: '3/4',
                border: '2px dashed #D1D5DB',
                borderRadius: 6,
                cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: '#9CA3AF',
                background: '#FAFAFA',
              }}>{uploading ? '...' : '+'}</div>
          )}
        </div>
        <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAddPhoto} />
        <div style={{ fontSize: 9, color: '#9CA3AF', textAlign: 'center' }}>
          {(f.gallery_photos || []).length} de 8 fotos · Se muestran en grid 4 × 2
        </div>
      </div>

      <Fld label="Texto del botón">
        <input
          className="neu-input"
          placeholder="Ej: Shop conjuntos"
          value={f.gallery_cta_text}
          onChange={e => setF({ ...f, gallery_cta_text: e.target.value })}
        />
      </Fld>

      <Fld label="¿A dónde lleva el botón?">
        <select
          className="neu-input"
          value={f.gallery_cta_type}
          onChange={e => setF({ ...f, gallery_cta_type: e.target.value, gallery_cta_value: '' })}>
          <option value="none">Sin link (solo decorativo)</option>
          <option value="category">Filtrar por categoría del catálogo</option>
          <option value="url">URL externa (ej: Instagram)</option>
        </select>
      </Fld>

      {f.gallery_cta_type === 'category' && (
        <Fld label="Categoría">
          <select
            className="neu-input"
            value={f.gallery_cta_value}
            onChange={e => setF({ ...f, gallery_cta_value: e.target.value })}>
            <option value="">Selecciona una categoría</option>
            {(categories || []).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 4 }}>
            Al hacer clic, el catálogo se filtra por esta categoría.
          </div>
        </Fld>
      )}

      {f.gallery_cta_type === 'url' && (
        <Fld label="URL completa">
          <input
            className="neu-input"
            type="url"
            placeholder="https://instagram.com/splendora.col"
            value={f.gallery_cta_value}
            onChange={e => setF({ ...f, gallery_cta_value: e.target.value })}
          />
        </Fld>
      )}

      <div style={{
        marginTop: 18, padding: 0,
        border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{ fontSize: 9, color: '#9CA3AF', letterSpacing: 1, padding: '10px 14px 6px', textTransform: 'uppercase', background: '#FAFAFA' }}>Vista previa</div>
        {f.gallery_word || (f.gallery_photos || []).length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: 200 }}>
            <div style={{ background: '#FAF8F5', padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 9, fontWeight: 800, color: '#1A1D23', letterSpacing: 2, textTransform: 'uppercase' }}>Splendora.col</div>
              <div style={{ margin: '8px 0' }}>
                {f.gallery_word && <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 36, color: '#1A1D23', lineHeight: 1, letterSpacing: '-1px' }}>{f.gallery_word}</div>}
                {f.gallery_subtitle && <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, color: '#5F5E5A', marginTop: 8, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{f.gallery_subtitle}</div>}
              </div>
              {f.gallery_cta_text && f.gallery_cta_type !== 'none' && (
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, borderBottom: '1.5px solid #1A1D23', display: 'inline-block', paddingBottom: 2, alignSelf: 'flex-start', color: '#1A1D23' }}>{f.gallery_cta_text} →</div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 1, background: '#FFFFFF' }}>
              {Array.from({ length: 8 }).map((_, i) => {
                const url = (f.gallery_photos || [])[i];
                return (
                  <div key={i} style={{ position: 'relative', background: '#F7F5F0' }}>
                    {url ? (
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#D1D5DB' }}>+</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', padding: 24 }}>
            Llena la palabra grande o sube fotos para ver la vista previa
          </div>
        )}
      </div>

      <button
        type="button"
        className="neu-btn neu-btn-accent"
        style={{ width: '100%', marginTop: 16, padding: 12 }}
        onClick={() => onSave(f)}>
        💾 Guardar sección gallery
      </button>
    </div>
  );
}
