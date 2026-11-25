import { amountInWords } from '@/lib/words';

/**
 * The Open Graph card for a cheque link.
 *
 * It draws the cheque the way `ChequePaper` does on the claim page, but with the
 * payee name masked. Whoever holds the link already knows the cheque is for
 * them; the preview must never disclose the full legal name, because the link
 * travels through chats, screenshots and link unfurlers.
 *
 * Only satori-safe CSS is used here: flexbox, no grid, no shorthands, no
 * box-shadow, no filters, explicit `boxSizing` so padding never widens a row.
 */

export interface ChequeCardProps {
  /** Formatted amount, e.g. "₦13,579,100.00". */
  amount: string;
  /** Raw major-unit amount, used to spell the amount out. */
  amountValue: string | number;
  /** Masked payee, e.g. "Amina I******". Never the full name. */
  payee: string;
  /** Sender's first name, e.g. "Ama". */
  from?: string | null;
  currency: string;
  code: string;
  date?: string;
  expires?: string;
  note?: string | null;
  /** Human state label: "Ready to claim", "Paid", "Expired"… */
  stateLabel?: string;
  /** Headline above the cheque. */
  title?: string;
  /** Second line under the headline. */
  subtitle?: string;
}

/** Same masking the API applies, repeated here so a full name can never leak. */
export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0] + '*'.repeat(Math.max(p.length - 1, 2)))
    .join(' ');
}

const C = {
  paper: '#f3ede4',
  cheque: '#f4efe0',
  night: '#122315',
  ink: '#122315',
  soft: '#454f48',
  mute: '#626d66',
  sage: '#566053',
  brand: '#2b8a24',
  badge: '#ffed52',
};

const UI = 'Inter, InterExt';
const DISPLAY = 'Antonio, Inter, InterExt';
const MONO = 'DMMono, InterExt';

const label = (text: string) => (
  <div
    style={{
      display: 'flex',
      fontFamily: UI,
      fontSize: '9px',
      fontWeight: 600,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: C.sage,
    }}
  >
    {text}
  </div>
);

export function ChequeCard(props: ChequeCardProps) {
  const currency = props.currency || 'USD';
  const words = Number(props.amountValue) > 0 ? amountInWords(props.amountValue, currency) : '';
  const payee = maskName(props.payee || '');
  const micr = (props.code || '').replace(/[^A-Z0-9]/gi, '');
  const micrAmount = Math.round(Number(props.amountValue || 0) * 100)
    .toString()
    .padStart(10, '0');

  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.paper,
        padding: '38px 56px 30px 56px',
        fontFamily: UI,
      }}
    >
      {/* brand line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontFamily: DISPLAY, fontSize: '40px', fontWeight: 700, color: C.night }}>
            sencheq.
          </div>
          <div
            style={{
              display: 'flex',
              marginLeft: '14px',
              marginBottom: '6px',
              fontFamily: UI,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.brand,
            }}
          >
            Cross-border cheque
          </div>
        </div>
        {props.stateLabel ? (
          <div
            style={{
              display: 'flex',
              boxSizing: 'border-box',
              borderRadius: '999px',
              padding: '7px 15px',
              backgroundColor: C.badge,
              color: C.night,
              fontFamily: UI,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            {props.stateLabel}
          </div>
        ) : null}
      </div>

      {/* headline */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '16px', width: '100%' }}>
        <div
          style={{
            display: 'flex',
            fontFamily: UI,
            fontSize: '72px',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            color: C.night,
          }}
        >
          {props.title ?? props.amount}
        </div>
        {props.subtitle ? (
          <div style={{ display: 'flex', marginTop: '8px', fontFamily: UI, fontSize: '19px', fontWeight: 500, color: C.mute }}>
            {props.subtitle}
          </div>
        ) : null}
      </div>

      {/* the cheque */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '20px',
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: '10px',
          border: '1px solid rgba(18,35,21,0.45)',
          backgroundColor: C.cheque,
          padding: '20px 30px 16px 30px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: '28px' }}>
            {label('Pay to the order of')}
            <div style={{ display: 'flex', marginTop: '4px', fontFamily: DISPLAY, fontSize: '42px', fontWeight: 700, color: C.night }}>
              {payee}
            </div>
            <div style={{ display: 'flex', marginTop: '1px', fontFamily: UI, fontSize: '12px', fontWeight: 500, color: C.soft }}>
              {words}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', fontFamily: MONO, fontSize: '12px', letterSpacing: '0.1em', color: C.soft }}>
              No. {props.code}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: '8px',
                boxSizing: 'border-box',
                borderRadius: '6px',
                backgroundColor: C.night,
                padding: '9px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontFamily: UI,
                  fontSize: '25px',
                  fontWeight: 600,
                  color: C.paper,
                  letterSpacing: '-0.01em',
                }}
              >
                {props.amount}
              </div>
            </div>
          </div>
        </div>

        {/* memo / date / signature */}
        <div style={{ display: 'flex', marginTop: '14px', alignItems: 'flex-end', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: '24px' }}>
            {label('Memo')}
            <div style={{ display: 'flex', marginTop: '2px', fontFamily: UI, fontSize: '14px', fontWeight: 500, color: C.ink }}>
              {props.note ? props.note.slice(0, 44) : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '44px' }}>
            {label('Date')}
            <div
              style={{
                display: 'flex',
                marginTop: '2px',
                borderBottom: '1px solid rgba(18,35,21,0.6)',
                paddingBottom: '2px',
                fontFamily: UI,
                fontSize: '14px',
                fontWeight: 500,
                color: C.ink,
              }}
            >
              {props.date || ' '}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {label('Authorised signature')}
            <div style={{ display: 'flex', marginTop: '1px', fontFamily: DISPLAY, fontSize: '22px', fontWeight: 700, color: '#1b2a1c' }}>
              {props.from ?? 'sencheq'}
            </div>
          </div>
        </div>

        {/* MICR strip */}
        <div
          style={{
            display: 'flex',
            marginTop: '12px',
            width: '100%',
            boxSizing: 'border-box',
            borderTop: '1px dashed rgba(18,35,21,0.35)',
            paddingTop: '7px',
            justifyContent: 'space-between',
            fontFamily: MONO,
            fontSize: '12px',
            letterSpacing: '0.24em',
            color: C.soft,
          }}
        >
          <div style={{ display: 'flex' }}>{`${micr} · 0H5 · ${micrAmount}`}</div>
          <div style={{ display: 'flex' }}>{currency}</div>
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          width: '100%',
          boxSizing: 'border-box',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', fontFamily: UI, fontSize: '15px', fontWeight: 600, color: C.night }}>
          {props.expires ? `Open the link to claim · expires ${props.expires}` : 'Open the link to claim'}
        </div>
        <div style={{ display: 'flex', fontFamily: UI, fontSize: '15px', fontWeight: 500, color: C.mute }}>sencheq.com</div>
      </div>
    </div>
  );
}
