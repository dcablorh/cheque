import type { Metadata, Viewport } from 'next';
import { Inter, Anton, DM_Mono } from 'next/font/google';
import './globals.css';
import { WalletProviderWrapper } from '@/components/WalletProviderWrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Anton stands in for Deacon (Kikin's display face): black condensed grotesque, one weight.
const display = Anton({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3100'),
  title: 'sencheq — if you can send a message, you can send money',
  description:
    'Write a cheque, share the link, and whoever holds it can claim. If you can send a message, you can send money.',
  openGraph: {
    title: 'sencheq — if you can send a message, you can send money',
    description: 'Write a cheque, share the link, and whoever holds it can claim.',
    images: [{ url: '/brand/og.jpg', width: 1200, height: 630, alt: 'sencheq — if you can send a message, you can send money' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'sencheq — if you can send a message, you can send money',
    description: 'Write a cheque, share the link, and whoever holds it can claim.',
    images: ['/brand/og.jpg'],
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
