import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cheque — Digital Cheques for Ghana',
  description:
    'Send money with a name and a WhatsApp number. The recipient verifies, then chooses where it lands (Mobile Money or USDC). Settled on Stellar.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#080c14] text-slate-100 min-h-screen selection:bg-emerald-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
