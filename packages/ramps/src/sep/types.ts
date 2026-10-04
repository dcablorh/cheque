export interface Sep1Toml {
  NETWORK_PASSPHRASE?: string;
  TRANSFER_SERVER?: string; // SEP-6
  TRANSFER_SERVER_SEP0024?: string; // SEP-24
  WEB_AUTH_ENDPOINT?: string; // SEP-10
  KYC_SERVER?: string; // SEP-12
  DIRECT_PAYMENT_SERVER?: string; // SEP-31
  ANCHOR_QUOTE_SERVER?: string; // SEP-38
  SIGNING_KEY?: string;
  CURRENCIES?: Array<{
    code?: string;
    issuer?: string;
    display_decimals?: number;
    name?: string;
    desc?: string;
    is_asset_anchored?: boolean;
    anchor_asset_type?: string;
    anchor_asset?: string;
    status?: string;
  }>;
  DOCUMENTATION?: {
    ORG_NAME?: string;
    ORG_URL?: string;
    ORG_DESCRIPTION?: string;
  };
  [key: string]: unknown;
}

export interface Sep10Token {
  token: string;
  expiresAt: Date;
  account: string;
}

export interface Sep12FieldRequirement {
  type: 'string' | 'number' | 'date' | 'binary';
  description: string;
  choices?: string[];
  optional?: boolean;
  status?: 'ACCEPTED' | 'PROCESSING' | 'REJECTED' | 'VERIFICATION_REQUIRED';
  error?: string;
}

export interface Sep12CustomerInfo {
  id?: string;
  status: 'NEEDS_INFO' | 'PROCESSING' | 'ACCEPTED' | 'REJECTED';
  fields?: Record<string, Sep12FieldRequirement>;
  provided_fields?: Record<string, Sep12FieldRequirement>;
  message?: string;
}

export interface Sep12CustomerData {
  first_name?: string;
  last_name?: string;
  email_address?: string;
  birth_date?: string; // YYYY-MM-DD
  address?: string;
  city?: string;
  address_country_code?: string; // e.g. GHA
  mobile_number?: string; // E.164 +233XXXXXXXXX
  id_type?: string; // e.g. "national_id"
  id_number?: string;
  [key: string]: unknown;
}

export interface Sep38Asset {
  asset: string; // e.g. "stellar:USDC:GBBD..." or "iso4217:GHS"
  country_codes?: string[];
  sell_delivery_methods?: Array<{ name: string; description: string }>;
  buy_delivery_methods?: Array<{ name: string; description: string }>;
  decimals?: number;
}

export interface Sep38Info {
  assets: Sep38Asset[];
}

export interface Sep38Price {
  asset: string;
  price: string;
  decimals?: number;
}

export interface Sep38PricesResponse {
  buy_assets: Sep38Price[];
}

export interface Sep38QuoteRequest {
  context: 'sep6' | 'sep24' | 'sep31';
  sell_asset: string;
  buy_asset: string;
  sell_amount?: string;
  buy_amount?: string;
  sell_delivery_method?: string;
  buy_delivery_method?: string;
  country_code?: string;
}

export interface Sep38Quote {
  id: string;
  expires_at: string;
  price: string;
  total_price: string;
  sell_asset: string;
  sell_amount: string;
  buy_asset: string;
  buy_amount: string;
  fee?: {
    total: string;
    asset: string;
  };
}

export interface Sep6FieldDesc {
  description: string;
  optional?: boolean;
  choices?: string[];
}

export interface Sep6DepositAssetInfo {
  enabled: boolean;
  authentication_required?: boolean;
  min_amount?: number;
  max_amount?: number;
  fee_fixed?: number;
  fee_percent?: number;
  funding_methods?: string[];
  fields?: Record<string, Sep6FieldDesc>;
}

export interface Sep6WithdrawAssetInfo {
  enabled: boolean;
  authentication_required?: boolean;
  min_amount?: number;
  max_amount?: number;
  fee_fixed?: number;
  fee_percent?: number;
  funding_methods?: string[];
  types?: Record<
    string,
    {
      fields: Record<string, Sep6FieldDesc>;
    }
  >;
}

export interface Sep6Info {
  deposit: Record<string, Sep6DepositAssetInfo>;
  'deposit-exchange'?: Record<string, unknown>;
  withdraw: Record<string, Sep6WithdrawAssetInfo>;
  'withdraw-exchange'?: Record<string, unknown>;
  fee?: { enabled: boolean };
  transactions?: { enabled: boolean; authentication_required: boolean };
  transaction?: { enabled: boolean; authentication_required: boolean };
  features?: {
    account_creation?: boolean;
    claimable_balances?: boolean;
  };
}

export type Sep6TransactionStatus =
  | 'incomplete'
  | 'pending_user_transfer_start'
  | 'pending_user_transfer_complete'
  | 'pending_external'
  | 'pending_anchor'
  | 'pending_stellar'
  | 'pending_trust'
  | 'pending_user'
  | 'pending_payout_confirmation'
  | 'completed'
  | 'refunded'
  | 'expired'
  | 'no_market'
  | 'too_small'
  | 'too_large'
  | 'error';

export interface Sep6Transaction {
  id: string;
  kind: 'deposit' | 'deposit-exchange' | 'withdrawal' | 'withdrawal-exchange';
  status: Sep6TransactionStatus;
  status_eta?: number;
  more_info_url?: string;
  amount_in?: string;
  amount_in_asset?: string;
  amount_out?: string;
  amount_out_asset?: string;
  amount_fee?: string;
  amount_fee_asset?: string;
  quote_id?: string;
  started_at: string;
  completed_at?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  message?: string;
  refunded?: boolean;
  // Deposit specific
  how?: string;
  // Withdraw specific
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: 'text' | 'id' | 'hash';
  [key: string]: unknown;
}

export interface Sep6DepositResponse {
  how?: string;
  id?: string;
  eta?: number;
  min_amount?: number;
  max_amount?: number;
  fee_fixed?: number;
  fee_percent?: number;
  extra_info?: Record<string, unknown>;
  instructions?: Record<string, unknown>;
}

export interface Sep6WithdrawResponse {
  account_id: string; // The anchor's Stellar address to send funds to
  memo_type?: 'text' | 'id' | 'hash';
  memo?: string;
  id: string;
  eta?: number;
  min_amount?: number;
  max_amount?: number;
  fee_fixed?: number;
  fee_percent?: number;
  extra_info?: Record<string, unknown>;
}

export interface Sep24InteractiveResponse {
  type: 'interactive_customer_info_needed';
  url: string;
  id: string;
}

export interface AnchorWebhookEvent {
  event: 'order.completed' | 'order.failed' | 'order.expired' | string;
  order_id: string;
  type: 'onramp' | 'offramp' | string;
  fiat_amount: string;
  fiat_currency: string;
  crypto_amount: string;
  crypto_currency: string;
  destination_address: string;
  timestamp: string;
  [key: string]: unknown;
}
