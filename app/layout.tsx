import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import './globals.css';

const body = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });
const disp = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-disp', display: 'swap' });

export const metadata: Metadata = {
  title: 'Cuan Lens',
  description: 'Marketplace, marketing, operasional, finance, dan CS untuk ngado.kado, giveme.id, smolify.id',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EDF1F0' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1817' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${body.variable} ${disp.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
