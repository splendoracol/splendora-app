import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase para el lado del servidor (solo lectura, con la anon key)
function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

const cur = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n || 0);

// Re-valida los datos cada 5 minutos para que los cambios en la DB se reflejen en los previews
export const revalidate = 300;

export async function generateMetadata({ params }) {
  const code = params?.code;
  if (!code) {
    return { title: 'SPLENDORA.COL' };
  }

  const supabase = supabaseServer();
  const { data: p } = await supabase
    .from('products')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!p) {
    return {
      title: 'Producto no encontrado — SPLENDORA.COL',
      description: 'Este producto ya no está disponible.',
    };
  }

  const disc = p.discount > 0;
  const fp = disc
    ? Math.round((p.price || 0) * (1 - p.discount / 100))
    : p.price || 0;
  const priceStr = p.hide_price ? '' : ` — ${cur(fp)}`;
  const categories = (p.categories || [p.category]).filter(Boolean).join(' · ');
  const photos = [p.photo_url, p.photo_url_2, ...(p.extra_photos || [])].filter(Boolean);
  const mainPhoto = photos[0];

  const title = `${p.name}${priceStr} — SPLENDORA.COL`;
  const description =
    `${categories}${p.description ? '. ' + p.description : ''}` ||
    'Ropa para dama en SPLENDORA.COL';

  return {
    title,
    description,
    openGraph: {
      title: `${p.name}${priceStr}`,
      description,
      images: mainPhoto
        ? [{ url: mainPhoto, width: 800, height: 800, alt: p.name }]
        : [],
      type: 'website',
      siteName: 'SPLENDORA.COL',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${p.name}${priceStr}`,
      description,
      images: mainPhoto ? [mainPhoto] : [],
    },
  };
}

export default async function ProductoPage({ params }) {
  const code = params?.code || '';
  const target = `/catalogo?code=${encodeURIComponent(code)}`;

  // Página muy mínima: redirige al catálogo con el modal abierto.
  // Los bots de WhatsApp/Instagram/Facebook no ejecutan JS, entonces
  // se quedan con los meta tags de generateMetadata (preview bonito).
  // Los usuarios reales sí ejecutan el script y son redirigidos.
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Montserrat', sans-serif",
        background: '#F0F2F5',
        padding: 20,
      }}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(target)});`,
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 2,
            marginBottom: 6,
          }}
        >
          SPLENDORA
        </div>
        <div
          style={{
            fontSize: 9,
            color: '#9CA3AF',
            letterSpacing: 3,
            marginBottom: 20,
          }}
        >
          C O L
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 20 }}>
          Abriendo producto...
        </div>
        <a
          href={target}
          style={{
            display: 'inline-block',
            background: '#4A6FA5',
            color: '#FFF',
            padding: '10px 24px',
            borderRadius: 12,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Ver producto
        </a>
      </div>
    </div>
  );
}
