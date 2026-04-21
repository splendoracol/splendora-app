import { createClient } from '@supabase/supabase-js';

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

// Re-valida la metadata cada 5 minutos para que los cambios en la DB
// se reflejen en los previews de WhatsApp/Instagram sin redeploy.
export const revalidate = 300;

export async function generateMetadata() {
  const supabase = supabaseServer();
  const { data: cfg } = await supabase
    .from('catalog_config')
    .select('share_image_url')
    .eq('id', 1)
    .maybeSingle();

  const img = cfg?.share_image_url;
  const title = 'Catálogo — SPLENDORA.COL';
  const description = 'Ropa para dama. Mira toda la colección.';

  return {
    title,
    description,
    openGraph: {
      title: 'SPLENDORA.COL',
      description,
      type: 'website',
      siteName: 'SPLENDORA.COL',
      images: img
        ? [{ url: img, width: 1200, height: 630, alt: 'SPLENDORA.COL' }]
        : [],
    },
    twitter: {
      card: img ? 'summary_large_image' : 'summary',
      title: 'SPLENDORA.COL',
      description,
      images: img ? [img] : [],
    },
  };
}

export default function CatalogoLayout({ children }) {
  return children;
}
