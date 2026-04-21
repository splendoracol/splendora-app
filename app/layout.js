import './globals.css';

const LOGO_URL = 'https://bpuguxbqvskxwugnubbf.supabase.co/storage/v1/object/public/product-photos/1776460410296_84kr.png';

export const metadata = {
  title: 'SPLENDORA.COL',
  description: 'Ropa para dama — Catálogo y tienda online',
  icons: {
    icon: LOGO_URL,
    apple: LOGO_URL,
  },
  // Sin `images` en openGraph/twitter:
  // así los previews de WhatsApp no muestran el logo como fallback cuando un producto
  // no tiene foto cargada. Cada producto define su propia foto en /producto/[code].
  openGraph: {
    title: 'SPLENDORA.COL',
    description: 'Ropa para dama — Catálogo online',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'SPLENDORA.COL',
    description: 'Ropa para dama — Catálogo online',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href={LOGO_URL} />
        <link rel="apple-touch-icon" href={LOGO_URL} />
      </head>
      <body>{children}</body>
    </html>
  );
}
