/**
 * Platform rules for the Stellar wallet picker. Kept free of React/Next and of the wallet kit
 * itself so it can be unit-tested in Node.
 *
 * Why this exists: Stellar Wallets Kit's `defaultModules()` only contains browser-extension and
 * web-popup wallets. A phone browser never has an extension injected, so the kit marked LOBSTR,
 * Freighter/Varial, Rabet, etc. as unavailable and, when tapped, opened their download page
 * ("Install") even though the user's wallet app was already installed. Mobile wallet apps are
 * reached through WalletConnect, which the kit only offers when the app registers it with a
 * Reown (WalletConnect) project id.
 */

export const WALLET_CONNECT_ID = 'wallet_connect';
export const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

export interface NavigatorLike {
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean } | null;
}

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|webOS|BlackBerry|Silk/i;

/** True for phone/tablet browsers, including iPadOS which reports a desktop Mac user agent. */
export function isMobileBrowser(nav: NavigatorLike | undefined | null): boolean {
  if (!nav) return false;
  if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean' && nav.userAgentData.mobile) return true;
  const ua = nav.userAgent ?? '';
  if (MOBILE_UA.test(ua)) return true;
  // iPadOS 13+ Safari: "Macintosh" UA but a touch screen.
  return /Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/** Normalises the Reown/WalletConnect project id; empty or placeholder values mean "not configured". */
export function readWalletConnectProjectId(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  if (!v || /^(changeme|your[-_ ]?project[-_ ]?id|xxx+|<.*>)$/i.test(v)) return null;
  return v;
}

export type WalletConnectChain = 'stellar:pubnet' | 'stellar:testnet';

export function walletConnectChain(networkPassphrase: string): WalletConnectChain {
  return networkPassphrase === PUBLIC_PASSPHRASE ? 'stellar:pubnet' : 'stellar:testnet';
}

/** The subset of the kit's ModuleInterface this file relies on. */
export interface WalletModuleLike {
  moduleType: string;
  productId: string;
  productName: string;
  productUrl: string;
  productIcon: string;
  isAvailable(): Promise<boolean>;
  isPlatformWrapper?(): Promise<boolean>;
  getAddress(params?: { path?: string; skipRequestAccess?: boolean }): Promise<{ address: string }>;
  signTransaction(xdr: string, opts?: Record<string, unknown>): Promise<{ signedTxXdr: string; signerAddress?: string }>;
  signAuthEntry(entry: string, opts?: Record<string, unknown>): Promise<{ signedAuthEntry: string; signerAddress?: string }>;
  signMessage(message: string, opts?: Record<string, unknown>): Promise<{ signedMessage: string; signerAddress?: string }>;
  getNetwork(): Promise<{ network: string; networkPassphrase: string }>;
  signAndSubmitTransaction?(xdr: string, opts?: Record<string, unknown>): Promise<{ status: 'success' | 'pending' }>;
  disconnect?(): Promise<void>;
}

export function extensionUnavailableOnMobileMessage(walletName: string, walletConnectReady: boolean): string {
  const viaWc = walletConnectReady
    ? `Tap "WalletConnect" and choose ${walletName} to use your ${walletName} app, or open this page in the wallet's in-app browser.`
    : `Open this page in your wallet app's built-in browser, or use Albedo or xBull, which work on phones.`;
  return `${walletName} connects here through its browser extension, which phones don't support. ${viaWc}`;
}

export const WALLET_CONNECT_NOT_CONFIGURED =
  'WalletConnect is not set up on this site yet (missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID). Open this page in your wallet app\u2019s built-in browser, or use Albedo or xBull for now.';

export const WALLET_CONNECT_NOT_STARTED =
  'WalletConnect could not start. Check your connection and try again in a moment.';

const METHODS = ['signTransaction', 'signAuthEntry', 'signMessage', 'getNetwork', 'signAndSubmitTransaction', 'disconnect', 'isPlatformWrapper'] as const;

/**
 * Wraps a module so the kit's picker always lists it as selectable (no misleading "Install" link)
 * and, if the underlying wallet still isn't usable when the user picks it, fails with `message`
 * instead of sending them to a download page. When the wallet *is* usable (for example the page is
 * open inside a wallet's in-app browser that injects the provider) everything passes straight through.
 *
 * `waitMs` lets slow starters (WalletConnect's sign client initialises asynchronously) finish
 * starting before we give up.
 */
export function selectableWithMessage<T extends WalletModuleLike>(
  inner: T,
  message: string | (() => string),
  opts: { waitMs?: number; pollMs?: number } = {}
): WalletModuleLike {
  const { waitMs = 0, pollMs = 100 } = opts;
  const ready = async () => {
    const deadline = Date.now() + waitMs;
    for (;;) {
      if (await inner.isAvailable().catch(() => false)) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  };
  const wrapped: Record<string, unknown> = {
    moduleType: inner.moduleType,
    productId: inner.productId,
    productName: inner.productName,
    productUrl: inner.productUrl,
    productIcon: inner.productIcon,
    isAvailable: async () => true,
    getAddress: async (params?: { path?: string; skipRequestAccess?: boolean }) => {
      if (!(await ready())) throw new Error(typeof message === 'function' ? message() : message);
      return inner.getAddress(params);
    },
  };
  for (const m of METHODS) {
    const fn = (inner as unknown as Record<string, unknown>)[m];
    // Bind to the real instance: kit modules use #private fields that break on a proxy `this`.
    if (typeof fn === 'function') wrapped[m] = (fn as (...a: unknown[]) => unknown).bind(inner);
  }
  return wrapped as unknown as WalletModuleLike;
}

/** A picker entry that only explains why it can't be used (WalletConnect without a project id). */
export function explainerModule(base: Pick<WalletModuleLike, 'moduleType' | 'productId' | 'productName' | 'productUrl' | 'productIcon'>, message: string): WalletModuleLike {
  const fail = async (): Promise<never> => {
    throw new Error(message);
  };
  return { ...base, isAvailable: async () => true, getAddress: fail, signTransaction: fail, signAuthEntry: fail, signMessage: fail, getNetwork: fail };
}

/**
 * Decides which modules the picker shows.
 *
 * Desktop: the kit's defaults in their original order (unchanged), plus WalletConnect at the end
 *          when a project id is configured (QR code for a phone wallet).
 * Mobile:  WalletConnect first (or an explainer entry when it isn't configured), then every
 *          default wallet wrapped so extension-only wallets explain themselves instead of
 *          offering an "Install" link.
 */
export function planWalletModules(input: {
  mobile: boolean;
  defaults: WalletModuleLike[];
  walletConnect: WalletModuleLike | null;
  walletConnectIcon?: string;
}): WalletModuleLike[] {
  const { mobile, defaults, walletConnect } = input;
  const wc = walletConnect ? selectableWithMessage(walletConnect, WALLET_CONNECT_NOT_STARTED, { waitMs: 10_000 }) : null;
  if (!mobile) return wc ? [...defaults, wc] : [...defaults];

  const wcEntry =
    wc ??
    explainerModule(
      {
        moduleType: 'BRIDGE_WALLET',
        productId: WALLET_CONNECT_ID,
        productName: 'WalletConnect',
        productUrl: 'https://walletconnect.com/',
        productIcon: input.walletConnectIcon ?? 'https://stellar.creit.tech/wallet-icons/walletconnect.png',
      },
      WALLET_CONNECT_NOT_CONFIGURED
    );
  const others = defaults.map((m) => selectableWithMessage(m, extensionUnavailableOnMobileMessage(m.productName, !!walletConnect)));
  return [wcEntry, ...others];
}
