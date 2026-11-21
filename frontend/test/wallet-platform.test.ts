import { describe, expect, it } from 'vitest';
import {
  isMobileBrowser,
  planWalletModules,
  readWalletConnectProjectId,
  selectableWithMessage,
  walletConnectChain,
  WALLET_CONNECT_ID,
  WALLET_CONNECT_NOT_CONFIGURED,
  WALLET_CONNECT_NOT_STARTED,
  type WalletModuleLike,
} from '../src/lib/wallet-platform';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  ipados: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

function fakeModule(id: string, available: boolean | (() => boolean), extra: Partial<WalletModuleLike> = {}) {
  const calls: string[] = [];
  const mod: WalletModuleLike & { calls: string[] } = {
    calls,
    moduleType: 'HOT_WALLET',
    productId: id,
    productName: id.toUpperCase(),
    productUrl: `https://${id}.example`,
    productIcon: `https://${id}.example/icon.png`,
    isAvailable: async () => (typeof available === 'function' ? available() : available),
    getAddress: async () => {
      calls.push('getAddress');
      return { address: `G-${id}` };
    },
    signTransaction: async (xdr: string) => {
      calls.push(`sign:${xdr}`);
      return { signedTxXdr: `${xdr}-signed` };
    },
    signAuthEntry: async () => ({ signedAuthEntry: 'a' }),
    signMessage: async () => ({ signedMessage: 'm' }),
    getNetwork: async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
    ...extra,
  };
  return mod;
}

describe('isMobileBrowser', () => {
  it('detects phones and iPadOS', () => {
    expect(isMobileBrowser({ userAgent: UA.iphone })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.android })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.ipados, maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.windows, userAgentData: { mobile: true } })).toBe(true);
  });
  it('leaves desktops alone', () => {
    expect(isMobileBrowser({ userAgent: UA.mac, maxTouchPoints: 0 })).toBe(false);
    expect(isMobileBrowser({ userAgent: UA.windows, userAgentData: { mobile: false } })).toBe(false);
    expect(isMobileBrowser(undefined)).toBe(false);
  });
});

describe('config helpers', () => {
  it('reads the WalletConnect project id, ignoring blanks and placeholders', () => {
    expect(readWalletConnectProjectId(undefined)).toBeNull();
    expect(readWalletConnectProjectId('  ')).toBeNull();
    expect(readWalletConnectProjectId('your_project_id')).toBeNull();
    expect(readWalletConnectProjectId(' abc123 ')).toBe('abc123');
  });
  it('maps the network passphrase to the WalletConnect chain', () => {
    expect(walletConnectChain('Public Global Stellar Network ; September 2015')).toBe('stellar:pubnet');
    expect(walletConnectChain('Test SDF Network ; September 2015')).toBe('stellar:testnet');
  });
});

describe('planWalletModules', () => {
  const defaults = () => [fakeModule('albedo', true), fakeModule('lobstr', false), fakeModule('xbull', true)];

  it('desktop without WalletConnect keeps the kit defaults untouched', () => {
    const d = defaults();
    expect(planWalletModules({ mobile: false, defaults: d, walletConnect: null })).toEqual(d);
  });

  it('desktop with WalletConnect appends it after the defaults', () => {
    const d = defaults();
    const plan = planWalletModules({ mobile: false, defaults: d, walletConnect: fakeModule(WALLET_CONNECT_ID, true) });
    expect(plan.slice(0, 3)).toEqual(d);
    expect(plan.map((m) => m.productId)).toEqual(['albedo', 'lobstr', 'xbull', WALLET_CONNECT_ID]);
  });

  it('mobile puts WalletConnect first and never reports a wallet as uninstalled', async () => {
    const wc = fakeModule(WALLET_CONNECT_ID, true);
    const plan = planWalletModules({ mobile: true, defaults: defaults(), walletConnect: wc });
    expect(plan[0].productId).toBe(WALLET_CONNECT_ID);
    expect(await Promise.all(plan.map((m) => m.isAvailable()))).toEqual([true, true, true, true]);
    await expect(plan[0].getAddress()).resolves.toEqual({ address: `G-${WALLET_CONNECT_ID}` });
    expect(wc.calls).toContain('getAddress');
  });

  it('mobile: picking an extension-only wallet explains WalletConnect instead of an install link', async () => {
    const plan = planWalletModules({ mobile: true, defaults: defaults(), walletConnect: fakeModule(WALLET_CONNECT_ID, true) });
    const lobstr = plan.find((m) => m.productId === 'lobstr')!;
    await expect(lobstr.getAddress()).rejects.toThrow(/browser extension, which phones don't support.*WalletConnect.*LOBSTR/);
  });

  it('mobile without a project id shows a WalletConnect entry that says it is not configured', async () => {
    const plan = planWalletModules({ mobile: true, defaults: defaults(), walletConnect: null });
    expect(plan[0].productId).toBe(WALLET_CONNECT_ID);
    await expect(plan[0].getAddress()).rejects.toThrow(WALLET_CONNECT_NOT_CONFIGURED);
    const lobstr = plan.find((m) => m.productId === 'lobstr')!;
    await expect(lobstr.getAddress()).rejects.toThrow(/built-in browser/);
  });

  it('mobile in-app wallet browser: an injected wallet still connects normally', async () => {
    const plan = planWalletModules({ mobile: true, defaults: [fakeModule('lobstr', true)], walletConnect: null });
    await expect(plan[1].getAddress()).resolves.toEqual({ address: 'G-lobstr' });
  });
});

describe('selectableWithMessage', () => {
  it('waits for a slow starter (WalletConnect sign client) before connecting', async () => {
    let ready = false;
    setTimeout(() => (ready = true), 30);
    const w = selectableWithMessage(fakeModule('wc', () => ready), WALLET_CONNECT_NOT_STARTED, { waitMs: 1000, pollMs: 5 });
    await expect(w.getAddress()).resolves.toEqual({ address: 'G-wc' });
  });

  it('gives up with the message when it never starts', async () => {
    const w = selectableWithMessage(fakeModule('wc', false), WALLET_CONNECT_NOT_STARTED, { waitMs: 20, pollMs: 5 });
    await expect(w.getAddress()).rejects.toThrow(WALLET_CONNECT_NOT_STARTED);
  });

  it('binds delegated methods to the real module instance', async () => {
    class WithPrivate {
      #secret = 'ok';
      moduleType = 'HOT_WALLET';
      productId = 'p';
      productName = 'P';
      productUrl = '';
      productIcon = '';
      async isAvailable() { return true; }
      async getAddress() { return { address: this.#secret }; }
      async signTransaction(xdr: string) { return { signedTxXdr: xdr + this.#secret }; }
      async signAuthEntry() { return { signedAuthEntry: this.#secret }; }
      async signMessage() { return { signedMessage: this.#secret }; }
      async getNetwork() { return { network: this.#secret, networkPassphrase: '' }; }
    }
    const w = selectableWithMessage(new WithPrivate(), 'x');
    await expect(w.signTransaction('tx')).resolves.toEqual({ signedTxXdr: 'txok' });
    await expect(w.getAddress()).resolves.toEqual({ address: 'ok' });
  });

  it('keeps the error text clear of words the UI treats as a silent cancel', async () => {
    const plan = planWalletModules({ mobile: true, defaults: [fakeModule('rabet', false)], walletConnect: null });
    for (const m of plan) {
      const msg = await m.getAddress().then(() => '', (e: Error) => e.message);
      expect(msg).not.toMatch(/closed|cancel|reject|denied/i);
    }
  });
});
