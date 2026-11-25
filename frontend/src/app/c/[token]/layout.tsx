import type { Metadata } from 'next';
import { fmtMoney } from '@/lib/api';
import { maskName } from '@/app/og/cheque-card';
import { fetchPublicCheque } from '@/app/og/cheque';

/**
 * Metadata for a claim link. The link travels through chats, so the title and
 * description show the amount and the sender's first name only — the full legal
 * payee name is never written into a preview (or into the OG image).
 */
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const cheque = await fetchPublicCheque(params.token);
  if (!cheque) {
    return {
      title: 'Claim your cheque · sencheq',
      description: 'Open this link to see the cheque and choose where the money goes.',
    };
  }
  const amount = fmtMoney(cheque.amount, cheque.currency);
  const from = cheque.senderFirstName?.trim();
  const payee = maskName(cheque.payee);
  const title = from ? `${from} sent you ${amount} · sencheq` : `A ${amount} cheque is waiting · sencheq`;
  const description = `A sencheq cheque for ${amount} is waiting to be claimed. Open the link to see it and choose where the money goes.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: { index: false, follow: false },
    other: {
      // Lets a debugger see who the cheque is for without exposing the name.
      'sencheq:payee': payee,
    },
  };
}

export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return children;
}
