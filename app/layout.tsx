import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sticky Takes — Make a scene. Literally.',
  description: 'Draw a backdrop, puppet your cast, record a take, and cut it together.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'Sticky Takes — Make a scene. Literally.',
    description: 'Draw a backdrop, puppet your cast, record a take, and cut it together.',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Sticky Takes storyboard studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sticky Takes — Make a scene. Literally.',
    description: 'Draw a backdrop, puppet your cast, record a take, and cut it together.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
