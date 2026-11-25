import { ImageResponse } from 'next/og';
import { ChequeCard } from '@/app/og/cheque-card';
import { loadOgFonts } from '@/app/og/fonts';
import { chequeToProps, fetchPublicCheque, sampleProps } from '@/app/og/cheque';

/**
 * The preview card for a claim link.
 *
 * The payee's full name is deliberately absent: the link is shareable and its
 * preview is fetched by every chat app, so the card shows the masked name, the
 * amount and the sender's first name — enough for the recipient to recognise
 * the cheque, not enough to expose who it belongs to.
 */

export const runtime = 'nodejs';
export const revalidate = 60;
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

export const alt = 'A sencheq cheque waiting to be claimed';

export default async function Image({ params }: { params: { token: string } }) {
  const cheque = await fetchPublicCheque(params.token);
  const fonts = await loadOgFonts();
  return new ImageResponse(<ChequeCard {...(cheque ? chequeToProps(cheque) : sampleProps())} />, {
    ...size,
    fonts,
  });
}
