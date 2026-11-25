import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, DM_Mono } from 'next/font/google';
import './globals.css';
import { WalletProviderWrapper } from '@/components/WalletProviderWrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Display face: heavy sentence-case headlines (the Wise-style look), same family feel as body Inter.
const display = Inter_Tight({ subsets: ['latin'], weight: ['700', '800', '900'], variable: '--font-display' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

/** Public origin, used for absolute OG asset URLs. */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://sencheq.com').replace(/\/+$/, '');
const OG_VIDEO = `${APP_URL}/brand/cheq.mp4`;
const OG_IMAGE = `${APP_URL}/brand/cheq-og.jpg`;

const TITLE = 'sencheq — if you can send a message, you can send money';
const DESCRIPTION =
  'Write a cheque, share the link, and whoever holds it can claim. If you can send a message, you can send money. Settled on Stellar.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'sencheq',
  openGraph: {
    type: 'website',
    siteName: 'sencheq',
    title: TITLE,
    description: DESCRIPTION,
    url: APP_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Two people holding a sencheq cheque between the flags of Ghana and Nigeria' }],
    videos: [{ url: OG_VIDEO, type: 'video/mp4', width: 1280, height: 720 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  // Meta and LinkedIn only read the raw property tags, so mirror the video set here.
  other: {
    'og:video': OG_VIDEO,
    'og:video:secure_url': OG_VIDEO,
    'og:video:type': 'video/mp4',
    'og:video:width': '1280',
    'og:video:height': '720',
    'og:video:alt': 'Two people holding a sencheq cheque between the flags of Ghana and Nigeria',
  },
};

export const viewport: Viewport = { themeColor: '#122315', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <WalletProviderWrapper>{children}</WalletProviderWrapper>
      </body>
    </html>
  );
}
