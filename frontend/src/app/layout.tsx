import type { Metadata, Viewport } from 'next';
import { Inter, Antonio, DM_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Antonio({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-display' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Cheque — if you can send a message, you can send money',
  description:
    'Digital cheques for Ghana. Send money to anyone with just their name and phone number; they verify and choose where it lands. Settled on Stellar.',
};

export const viewport: Viewport = { themeColor: '#122315', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
