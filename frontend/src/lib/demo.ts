/**
 * Demo mode (NEXT_PUBLIC_DEMO=1): the whole app runs in the browser with fake data, so every
 * page can be clicked through with no API, database, SMS or chain. State lives in localStorage.
 * Never enable this in production.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

const KEY = 'cheque.demo.v1';
const LINKS_KEY = 'cheque.links.v1';

interface DemoCheque {
  id: string;
  publicCode: string;
  token: string;
  state: string;
  payeeName: string;
  corridor: 'GH' | 'NG' | 'US';
  amount: string;
  currency: string;
  note: string | null;
  signature?: string | null;
  expiresAt: string;
  createdAt: string;
  destination?: string;
  settleAt?: number;
  funderAddress?: string | null;
}

const H = 3600_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

function seed(): DemoCheque[] {
  const mk = (
    id: string,
    state: string,
    name: string,
    corridor: DemoCheque['corridor'],
    amount: string,
    currency: string,
    note: string | null,
    exp: number,
    ago: number
  ): DemoCheque => ({
    id,
    publicCode: `CHQ-${id.toUpperCase().slice(0, 6).padEnd(6, '7')}`,
    token: `demo-${id}`,
    state,
    payeeName: name,
    corridor,
    amount,
    currency,
    note,
    expiresAt: iso(exp),
    createdAt: iso(-ago),
  });
  return [
    mk('active1', 'ACTIVE', 'Kojo Mensah', 'GH', '500.00', 'GHS', 'For rent, thank you', 40 * H, 2 * H),
    mk('active2', 'ACTIVE', 'Chidi Okafor', 'NG', '75000.00', 'NGN', 'School fees', 150 * H, 5 * H),
    mk('pending1', 'PENDING_FUNDING', 'Maya Johnson', 'US', '120.00', 'USD', null, 47 * H, 0.01 * H),
    mk('paid1', 'SETTLED', 'Ama Boateng', 'GH', '200.00', 'GHS', 'Birthday', 10 * H, 30 * H),
    mk('cancel1', 'CANCELLED', 'Tunde Bello', 'NG', '20000.00', 'NGN', null, 10 * H, 50 * H),
    mk('expired1', 'REFUNDED', 'Sam Carter', 'US', '45.00', 'USD', 'Lunch', -5 * H, 60 * H),
  ];
}

function save(list: DemoCheque[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    const links: Record<string, string> = {};
    for (const c of list) links[c.id] = `${location.origin}/c/${c.token}`;
    const prev = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '{}');
    localStorage.setItem(LINKS_KEY, JSON.stringify({ ...prev, ...links }));
  } catch {
    /* storage unavailable */
  }
}

function load(): DemoCheque[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to seed */
  }
  const s = seed();
  save(s);
  return s;
}

/** Advances in-flight payouts and funding so polling screens finish by themselves. */
function tick(list: DemoCheque[]): DemoCheque[] {
  let changed = false;
  for (const c of list) {
    if (c.state === 'AUTHORIZED' && c.settleAt && Date.now() >= c.settleAt) {
      c.state = 'SETTLED';
      changed = true;
    }
    if (c.state === 'PENDING_FUNDING' && Date.now() - new Date(c.createdAt).getTime() > 4000) {
      c.state = 'ACTIVE';
      changed = true;
    }
  }
  if (changed) save(list);
  return list;
}

class DemoError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const CONFIG = {
  network: 'TESTNET',
  chainEnabled: true,
  walletFunding: true,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  usdc: { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  feeBps: 100,
  corridors: [
    { code: 'GH', name: 'Ghana', currency: 'GHS', minAmount: 5, maxAmount: 2000, dialCode: '233', payoutMethods: ['USDC', 'MOMO'], perUsdc: '15.500000' },
    { code: 'NG', name: 'Nigeria', currency: 'NGN', minAmount: 2000, maxAmount: 1_000_000, dialCode: '234', payoutMethods: ['USDC', 'BANK'], perUsdc: '1550.000000' },
    { code: 'US', name: 'United States', currency: 'USD', minAmount: 5, maxAmount: 2000, dialCode: '1', payoutMethods: ['USDC', 'BANK'], perUsdc: '1.000000' },
  ],
};

export const DEMO_SESSION = {
  accessToken: 'demo',
  refreshToken: 'demo',
  phone: '+233241234567',
  name: 'Demo User',
};

function findByToken(list: DemoCheque[], token: string) {
  return list.find((x) => x.token === token) ?? (token === 'demo' ? list.find((x) => x.state === 'ACTIVE') : undefined);
}

/** Handles any API path in-browser. Throws errors shaped like the real client's. */
export function demoRequest(path: string, init: RequestInit = {}): unknown {
  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : {};
  const list = tick(load());
  let m: RegExpMatchArray | null;

  if (path === '/config') return CONFIG;
  if (path === '/auth/otp/request') return { sent: true };
  if (path === '/auth/otp/verify') {
    return { accessToken: 'demo', refreshToken: 'demo', user: { id: 'demo-user', name: body.name || DEMO_SESSION.name } };
  }
  if (path === '/auth/refresh') return { accessToken: 'demo', refreshToken: 'demo' };
  if (path === '/me') return { id: 'demo-user', phone: DEMO_SESSION.phone, name: DEMO_SESSION.name };

  if (path === '/cheques' && method === 'GET') {
    const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { cheques: sorted.map(({ token: _t, destination: _d, settleAt: _s, ...c }) => c) };
  }
  if (path === '/cheques' && method === 'POST') {
    const id = Math.random().toString(36).slice(2, 8);
    const corridor = (body.corridor ?? 'GH') as 'GH' | 'NG' | 'US';
    const c: DemoCheque = {
      id,
      publicCode: body.publicCode ?? `CHQ-${id.toUpperCase().padEnd(6, '7')}`,
      token: `demo-${id}`,
      state: 'PENDING_FUNDING',
      payeeName: body.payeeName,
      corridor,
      amount: Number(body.amount).toFixed(2),
      currency: { GH: 'GHS', NG: 'NGN', US: 'USD' }[corridor],
      note: body.note ?? null,
      signature: body.signature ?? null,
      funderAddress: body.funderAddress ?? null,
      expiresAt: iso((body.expiryHours ?? 48) * H),
      createdAt: iso(0),
    };
    list.unshift(c);
    save(list);
    return { id, claimUrl: `${location.origin}/c/${c.token}` };
  }
  if ((m = path.match(/^\/cheques\/([^/]+)\/tx\/prepare$/))) {
    if (!list.find((x) => x.id === m![1])) throw new DemoError('Cheque not found', 404);
    return { xdr: 'demo-xdr', networkPassphrase: 'Test SDF Network ; September 2015' };
  }
  if ((m = path.match(/^\/cheques\/([^/]+)\/tx\/submit$/))) {
    const c = list.find((x) => x.id === m![1]);
    if (!c) throw new DemoError('Cheque not found', 404);
    c.state = body.op === 'cancel' ? 'CANCELLED' : 'ACTIVE';
    save(list);
    return { state: c.state, txHash: 'b'.repeat(64) };
  }
  if ((m = path.match(/^\/cheques\/([^/]+)\/cancel$/))) {
    const c = list.find((x) => x.id === m![1]);
    if (!c) throw new DemoError('Cheque not found', 404);
    if (c.state !== 'ACTIVE') throw new DemoError(`Only an active cheque can be cancelled (currently ${c.state}).`, 409);
    c.state = 'CANCELLED';
    save(list);
    return { id: c.id, state: 'CANCELLED' };
  }

  if ((m = path.match(/^\/claim\/([^/]+)\/status$/))) {
    const c = findByToken(list, m[1]);
    if (!c) throw new DemoError('This cheque link is not valid.', 404);
    return {
      publicCode: c.publicCode,
      corridor: c.corridor,
      state: c.state,
      payee: c.payeeName,
      senderFirstName: 'Demo',
      amount: c.amount,
      currency: c.currency,
      note: c.note,
      signature: c.signature ?? null,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      destination: c.destination ? `${c.destination.slice(0, 4)}…${c.destination.slice(-4)}` : null,
      txHash: c.state === 'SETTLED' ? 'a'.repeat(64) : null,
      network: 'TESTNET',
    };
  }
  if ((m = path.match(/^\/claim\/([^/]+)\/redeem$/))) {
    const c = findByToken(list, m[1]);
    if (!c) throw new DemoError('This cheque link is not valid.', 404);
    if (c.state !== 'ACTIVE') throw new DemoError(`Cheque is ${c.state.toLowerCase()}; it can't be redeemed now.`, 409);
    c.state = 'AUTHORIZED';
    c.destination = body.destination?.accountRef ?? '';
    c.settleAt = Date.now() + 3500;
    save(list);
    return { state: 'AUTHORIZED' };
  }

  throw new DemoError(`Demo mode has no handler for ${method} ${path}`, 404);
}
