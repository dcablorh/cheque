/**
 * Branded HTML email templates. The design system in miniature: forest-ink header, cream
 * body, one meadow action. Email clients don't load web fonts and strip <style>, so
 * everything is tables + inline styles with system font stacks — Impact/Arial Narrow stand
 * in for the condensed display face. User-supplied strings are always escaped.
 */

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const INK = '#122315';
const PAPER = '#f3ede4';
const MEADOW = '#55dd4a';
const SAGE = '#566053';
const MOSS = '#999c91';
const CEDI = '#c8402f';

const DISPLAY = `Impact, 'Arial Narrow', 'Helvetica Neue Condensed', 'Helvetica Neue', sans-serif`;
const BODY_FONT = `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const MONO = `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace`;

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface WrapperOptions {
  preheader: string;
  heading: string;
  /** Rows between the heading and the CTA. Already-escaped HTML. */
  body: string;
  cta?: { label: string; url: string; note?: string };
  footerNote?: string;
}

function wrap(opts: WrapperOptions): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">
         <tr>
           <td bgcolor="${MEADOW}" style="border-radius:10px;">
             <a href="${opts.cta.url}" style="display:inline-block;padding:14px 28px;font-family:${BODY_FONT};font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;color:${INK};border-radius:10px;">${esc(opts.cta.label)}</a>
           </td>
         </tr>
       </table>
       ${
         opts.cta.note
           ? `<p style="margin:12px 0 0;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${MOSS};">${opts.cta.note}</p>`
           : ''
       }`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <span style="display:none;font-size:1px;color:${PAPER};">${esc(opts.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">
          <tr>
            <td bgcolor="${INK}" style="background-color:${INK};border-radius:20px 20px 0 0;padding:22px 32px;">
              <span style="font-family:${DISPLAY};font-size:26px;color:${PAPER};letter-spacing:.02em;text-transform:lowercase;">sencheq</span>
              <span style="font-family:${DISPLAY};font-size:26px;color:${MEADOW};">.</span>
            </td>
          </tr>
          <tr>
            <td bgcolor="#faf7f1" style="background-color:#faf7f1;border:1px solid ${SAGE};border-top:0;padding:36px 32px 32px;">
              <h1 style="margin:0;font-family:${DISPLAY};font-weight:normal;font-size:34px;line-height:.95;letter-spacing:-.01em;text-transform:uppercase;color:${INK};">${opts.heading}</h1>
              <div style="margin-top:20px;font-family:${BODY_FONT};font-size:15px;line-height:1.55;color:#333333;">
                ${opts.body}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td bgcolor="${INK}" style="background-color:${INK};border-radius:0 0 20px 20px;padding:20px 32px;">
              <p style="margin:0;font-family:${BODY_FONT};font-size:11px;line-height:1.6;color:${MOSS};">
                ${opts.footerNote ?? 'If you can send a message, you can send money.'}<br>
                Sent by sencheq — you are receiving this because someone used your email address. No reply is monitored.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function para(html: string): string {
  return `<p style="margin:0 0 12px;">${html}</p>`;
}

function detailTable(rows: { label: string; value: string; mono?: boolean }[]): string {
  const trs = rows
    .map(
      (r) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #e5e7eb;font-family:${BODY_FONT};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${SAGE};white-space:nowrap;padding-right:16px;">${esc(r.label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #e5e7eb;font-family:${BODY_FONT};font-size:14px;font-weight:600;color:${INK};text-align:right;${r.mono ? `font-family:${MONO};` : ''}">${r.value}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 4px;">${trs}</table>`;
}

/* -------------------------------------------------------------------------- OTP */

export function otpEmail(params: {
  code: string;
  purpose: 'sign in to sencheq' | 'claim your cheque';
  minutes?: number;
}): EmailContent {
  const { code, purpose, minutes = 5 } = params;
  const digits = code
    .split('')
    .map((d) => `<td style="padding:0 6px;"><span style="display:inline-block;min-width:44px;padding:12px 0;background:${PAPER};border:1px solid ${SAGE};border-radius:10px;font-family:${MONO};font-size:28px;font-weight:600;letter-spacing:.1em;color:${INK};text-align:center;">${esc(d)}</span></td>`)
    .join('');
  const html = wrap({
    preheader: `Your code is ${code} — it expires in ${minutes} minutes.`,
    heading: purpose === 'sign in to sencheq' ? 'Enter your code.' : 'One code to claim.',
    body: `
      ${para(`Use this code to ${esc(purpose)}. It expires in <strong>${minutes} minutes</strong>.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px 0;"><tr>${digits}</tr></table>
      <p style="margin:0;font-size:13px;color:${MOSS};">Never share this code — not with support, not with anyone. A sencheq cheque needs nothing but its link.</p>
    `,
  });
  return {
    subject: `Your sencheq code: ${code}`,
    text: `Your verification code is ${code}. It expires in ${minutes} minutes. Do not share it.`,
    html,
  };
}

/* ------------------------------------------------------------- recipient: new cheque */

export function chequeReceivedEmail(params: {
  payeeName: string;
  senderName?: string | null;
  amount: string;
  currency: string;
  note?: string | null;
  code?: string | null;
  claimUrl: string;
}): EmailContent {
  const { payeeName, senderName, amount, currency, note, code, claimUrl } = params;
  const from = senderName ? esc(senderName) : 'Someone';
  const greeting = payeeName ? `Hi <strong>${esc(payeeName.split(' ')[0])}</strong>! ` : '';
  const html = wrap({
    preheader: `${from} sent you ${amount} — open the link to claim it.`,
    heading: 'A cheque for you.',
    body: `
      ${para(`${greeting}<strong>${from}</strong> sent you a cheque for <strong>${esc(amount)} ${esc(currency)}</strong>.`)}
      ${para('There is nothing to sign up for and no app to install. Open the link, choose where the money goes — a USDC wallet today, local cash-out where available — and it is yours.')}
      ${detailTable([
        ...(code ? [{ label: 'Cheque №', value: esc(code), mono: true }] : []),
        { label: 'Amount', value: `${esc(amount)} ${esc(currency)}` },
        ...(note ? [{ label: 'Note', value: esc(note) }] : []),
      ])}
    `,
    cta: {
      label: 'Claim your cheque',
      url: claimUrl,
      note: 'Anyone who holds this link can claim the cheque — if you were not expecting it, ignore this email and the cheque returns to the sender when it expires.',
    },
  });
  return {
    subject: `${from} sent you a sencheq cheque (${amount} ${currency})`,
    text: `You have received ${amount} ${currency}${senderName ? ` from ${senderName}` : ''}.${code ? `\nCheque #: ${code}` : ''}${note ? `\nNote: "${note}"` : ''}\n\nOpen the link to claim it: ${claimUrl}`,
    html,
  };
}

/* ------------------------------------------------------------------ settled / refunded */

export function chequePaidSenderEmail(params: {
  code: string;
  payeeName: string;
  amount: string;
  chain?: string | null;
  explorerUrl?: string | null;
}): EmailContent {
  const { code, payeeName, amount, chain, explorerUrl } = params;
  const chainStr = chain ? ` on ${esc(chain)}` : '';
  const html = wrap({
    preheader: `Cheque ${code} for ${amount} has been paid to ${payeeName}.`,
    heading: 'Cheque paid.',
    body: `
      ${para(`Your cheque <strong>${esc(code)}</strong> for <strong>${esc(amount)}</strong> has been claimed and paid${chainStr} to <strong>${esc(payeeName)}</strong>.`)}
      ${detailTable([
        { label: 'Cheque №', value: esc(code), mono: true },
        { label: 'Amount', value: esc(amount) },
        { label: 'Paid to', value: esc(payeeName) },
        ...(chain ? [{ label: 'Delivered on', value: esc(chain) }] : []),
      ])}
      ${explorerUrl ? para(`<a href="${explorerUrl}" style="color:${MEADOW === '#55dd4a' ? '#2b8a24' : INK};">View the receipt on-chain →</a>`) : ''}
    `,
  });
  return {
    subject: `Cheque ${code} paid to ${payeeName}`,
    text: `Your cheque ${code} for ${amount} to ${payeeName} has been claimed and paid${chain ? ` on ${chain}` : ''}.${explorerUrl ? `\nReceipt: ${explorerUrl}` : ''}`,
    html,
  };
}

export function chequePaidPayeeEmail(params: {
  code: string;
  amount: string;
  chain?: string | null;
  explorerUrl?: string | null;
}): EmailContent {
  const { code, amount, chain, explorerUrl } = params;
  const chainStr = chain ? ` on ${esc(chain)}` : '';
  const html = wrap({
    preheader: `${amount} has arrived — cheque ${code} is paid.`,
    heading: 'Money delivered.',
    body: `
      ${para(`Cheque <strong>${esc(code)}</strong> for <strong>${esc(amount)}</strong> has been delivered${chainStr}. Check your wallet — it is yours.`)}
      ${detailTable([
        { label: 'Cheque №', value: esc(code), mono: true },
        { label: 'Amount', value: esc(amount) },
        ...(chain ? [{ label: 'Delivered on', value: esc(chain) }] : []),
      ])}
      ${explorerUrl ? para(`<a href="${explorerUrl}" style="color:#2b8a24;">View the receipt on-chain →</a>`) : ''}
    `,
  });
  return {
    subject: `Your sencheq payout (${amount}) has arrived`,
    text: `Your cheque ${code} for ${amount} has been delivered${chain ? ` on ${chain}` : ''}.${explorerUrl ? `\nReceipt: ${explorerUrl}` : ''}`,
    html,
  };
}

export function chequeRefundedEmail(params: { code: string; payeeName: string; amount: string }): EmailContent {
  const { code, payeeName, amount } = params;
  const html = wrap({
    preheader: `Cheque ${code} expired unclaimed — ${amount} returned to your wallet.`,
    heading: 'Returned to you.',
    body: `
      ${para(`Your cheque <strong>${esc(code)}</strong> for <strong>${esc(amount)}</strong> to <strong>${esc(payeeName)}</strong> expired without being claimed. The full amount has been refunded to the wallet that funded it — no action needed.`)}
      ${para(`You can always issue a fresh cheque from <strong style="color:${INK};">your dashboard</strong> if you still want to send it.`)}
      ${detailTable([
        { label: 'Cheque №', value: esc(code), mono: true },
        { label: 'Amount', value: esc(amount) },
        { label: 'Status', value: `<span style="color:${CEDI};">Refunded</span>` },
      ])}
    `,
  });
  return {
    subject: `Cheque ${code} expired and refunded`,
    text: `Your cheque ${code} for ${amount} to ${payeeName} expired unclaimed and has been refunded to the funding wallet.`,
    html,
  };
}
