import { describe, it, expect } from 'vitest';
import {
  ghsToPesewas,
  pesewasToGhsString,
  usdcToStroops,
  stroopsToUsdcString,
  addMinor,
  subMinor,
  maskPhone,
  maskName,
  maskAccountRef,
  generateClaimToken,
  hashClaimToken,
  generateOtp,
  hashOtp,
  verifyOtp,
  isValidTransition,
  canSenderCancel,
  createFundingTransaction,
  createSettlementPendingTransaction,
  createSettlementConfirmedTransaction,
  createSettlementFailedRollbackTransaction,
  createRefundTransaction,
  createFxBufferAdjustmentTransaction,
  validateLedgerTransaction,
  MockAdapter,
  CreateChequeSchema,
  RedeemChequeSchema,
} from '../src/index.js';

describe('Rule 2: Money Integer Minor Units', () => {
  it('converts GHS to pesewas accurately without floating point drift', () => {
    expect(ghsToPesewas('50.00')).toBe(5000);
    expect(ghsToPesewas('500')).toBe(50000);
    expect(ghsToPesewas('5.05')).toBe(505);
    expect(ghsToPesewas(12.34)).toBe(1234);
    expect(() => ghsToPesewas('invalid')).toThrow();
  });

  it('formats pesewas to GHS string correctly', () => {
    expect(pesewasToGhsString(505)).toBe('5.05');
    expect(pesewasToGhsString(50000)).toBe('500.00');
    expect(pesewasToGhsString(9)).toBe('0.09');
  });

  it('converts USDC to stroops accurately (7 decimals)', () => {
    expect(usdcToStroops('1')).toBe(10_000_000);
    expect(usdcToStroops('32.5')).toBe(325_000_000);
    expect(usdcToStroops('0.0000001')).toBe(1);
  });

  it('formats stroops to USDC string', () => {
    expect(stroopsToUsdcString(10_000_000)).toBe('1.0000000');
    expect(stroopsToUsdcString(325_000_000)).toBe('32.5000000');
    expect(stroopsToUsdcString(1)).toBe('0.0000001');
  });

  it('handles safe minor addition and subtraction', () => {
    expect(addMinor(100, 250)).toBe(350);
    expect(subMinor(350, 100)).toBe(250);
    expect(() => subMinor(100, 200)).toThrow('Cannot subtract');
  });
});

describe('Rule 9: PII Masking', () => {
  it('masks Ghana phone numbers properly', () => {
    expect(maskPhone('+233241234567')).toBe('+233 24 XXX 4567');
    expect(maskPhone('0241234567')).toBe('024 XXX 4567');
  });

  it('masks payee names for recipient landing screen', () => {
    expect(maskName('Kojo Mensah')).toBe('K**** M*****');
    expect(maskName('Kwame')).toBe('K****');
  });

  it('masks account references for receipts and audit logs', () => {
    expect(maskAccountRef('+233241234567', 'MOMO', 'MTN')).toBe('MTN ••• 4567');
    expect(
      maskAccountRef('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', 'USDC')
    ).toBe('GA5Z...KZVN');
  });
});

describe('Rule 8: 128-bit Claim Token and OTP Security', () => {
  it('generates a 128-bit random token, its SHA-256 hash, and a CHQ-XXXXXX short code', () => {
    const { rawToken, claimTokenHash, publicCode } = generateClaimToken();
    expect(rawToken).toBeTruthy();
    expect(claimTokenHash).toBe(hashClaimToken(rawToken));
    expect(publicCode).toMatch(/^CHQ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });

  it('verifies OTP in constant time with correct salt', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    const salt = 'cheque-salt-xyz';
    const hash = hashOtp(otp, salt);

    expect(verifyOtp(otp, salt, hash)).toBe(true);
    expect(verifyOtp('000000', salt, hash)).toBe(false);
  });
});

describe('Cheque Lifecycle State Machine', () => {
  it('allows normal happy path transitions', () => {
    expect(isValidTransition('DRAFT', 'PENDING_FUNDING').allowed).toBe(true);
    expect(isValidTransition('PENDING_FUNDING', 'ACTIVE').allowed).toBe(true);
    expect(isValidTransition('ACTIVE', 'CLAIMING').allowed).toBe(true);
    expect(isValidTransition('CLAIMING', 'AUTHORIZED').allowed).toBe(true);
    expect(isValidTransition('AUTHORIZED', 'SETTLING').allowed).toBe(true);
    expect(isValidTransition('SETTLING', 'SETTLED').allowed).toBe(true);
  });

  it('Rule 7: allows payout failure to return to AUTHORIZED (retryable)', () => {
    const res = isValidTransition('SETTLING', 'AUTHORIZED');
    expect(res.allowed).toBe(true);
  });

  it('blocks sender cancellation once CLAIMING begins', () => {
    expect(canSenderCancel('PENDING_FUNDING')).toBe(true);
    expect(canSenderCancel('ACTIVE')).toBe(true);
    expect(canSenderCancel('CLAIMING')).toBe(false);
    expect(canSenderCancel('AUTHORIZED')).toBe(false);
    expect(canSenderCancel('SETTLING')).toBe(false);

    const senderCancelInClaiming = isValidTransition('CLAIMING', 'REFUNDING', {
      actor: 'SENDER',
    });
    expect(senderCancelInClaiming.allowed).toBe(false);
  });

  it('prevents direct expiry on AUTHORIZED or SETTLING', () => {
    const authExpire = isValidTransition('AUTHORIZED', 'REFUNDING');
    expect(authExpire.allowed).toBe(false);
    const settlingExpire = isValidTransition('SETTLING', 'REFUNDING');
    expect(settlingExpire.allowed).toBe(false);
  });
});

describe('Rule 3: Double-Entry Ledger', () => {
  it('creates and balances a funding transaction', () => {
    const tx = createFundingTransaction({
      chequeId: 'chq-123',
      faceAmountMinor: 50000, // 500.00 GHS
      feeMinor: 500, // 5.00 GHS
      currency: 'GHS',
    });

    expect(() => validateLedgerTransaction(tx)).not.toThrow();
    const debits = tx.entries.reduce((acc, e) => acc + e.debitMinor, 0);
    const credits = tx.entries.reduce((acc, e) => acc + e.creditMinor, 0);
    expect(debits).toBe(credits);
    expect(debits).toBe(50500);
  });

  it('creates and balances settlement pending, confirmed, and rollback transactions', () => {
    const pendingTx = createSettlementPendingTransaction({
      chequeId: 'chq-123',
      amountMinor: 50000,
      currency: 'GHS',
    });
    expect(() => validateLedgerTransaction(pendingTx)).not.toThrow();

    const confirmedTx = createSettlementConfirmedTransaction({
      chequeId: 'chq-123',
      amountMinor: 50000,
      currency: 'GHS',
    });
    expect(() => validateLedgerTransaction(confirmedTx)).not.toThrow();

    const rollbackTx = createSettlementFailedRollbackTransaction({
      chequeId: 'chq-123',
      amountMinor: 50000,
      currency: 'GHS',
    });
    expect(() => validateLedgerTransaction(rollbackTx)).not.toThrow();
  });

  it('creates and balances refund and FX buffer transactions', () => {
    const refundTx = createRefundTransaction({
      chequeId: 'chq-123',
      amountMinor: 50000,
      currency: 'GHS',
    });
    expect(() => validateLedgerTransaction(refundTx)).not.toThrow();

    const fxTx = createFxBufferAdjustmentTransaction({
      chequeId: 'chq-123',
      shortfallMinor: 200,
      currency: 'GHS',
    });
    expect(() => validateLedgerTransaction(fxTx)).not.toThrow();
  });

  it('rejects an unbalanced transaction', () => {
    expect(() =>
      validateLedgerTransaction({
        txId: 'bad-tx',
        currency: 'GHS',
        description: 'unbalanced',
        entries: [
          { account: 'sender_funds', debitMinor: 100, creditMinor: 0 },
          { account: 'cheque_escrow', debitMinor: 0, creditMinor: 90 },
        ],
        createdAt: new Date(),
      })
    ).toThrow('does not balance');
  });
});

describe('Rule 5: SettlementAdapter & MockAdapter', () => {
  it('generates quote, fund instructions, and settlement', async () => {
    const adapter = new MockAdapter({ mockRate: '15.500000' });
    const mockCheque = {
      id: 'chq-test',
      publicCode: 'CHQ-TEST01',
      claimTokenHash: 'hash',
      senderId: 'user-1',
      payeeName: 'Ama Serwaa',
      payeePhoneE164: '+233241234567',
      faceAmountGhsMinor: 50000,
      feeMinor: 500,
      state: 'ACTIVE' as const,
      expiresAt: new Date(Date.now() + 86400000),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const quote = await adapter.quote(mockCheque);
    expect(quote.rate).toBe('15.500000');
    expect(quote.toAmountMinor).toBeGreaterThan(0);

    const fundMomo = await adapter.fund(mockCheque, 'MOMO');
    expect(fundMomo.paymentInstructions?.momoPromptSent).toBe(true);

    const settleRes = await adapter.settle(
      mockCheque,
      {
        id: 'dest-1',
        chequeId: mockCheque.id,
        type: 'MOMO',
        network: 'MTN',
        accountRef: '+233241234567',
        verifiedNameMatch: true,
      },
      'idemp-key-1'
    );
    expect(settleRes.status).toBe('CONFIRMED');

    const status = await adapter.status(settleRes.providerRef);
    expect(status.status).toBe('SUCCESS');
  });
});

describe('Zod Validation Schemas', () => {
  it('validates valid CreateChequeSchema', () => {
    const valid = CreateChequeSchema.safeParse({
      payeeName: 'Kojo Mensah',
      payeePhoneE164: '+233241234567',
      amountGhs: 500,
      note: 'For rent',
      expiryHours: 48,
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid phone or out of bounds amounts', () => {
    const invalidPhone = CreateChequeSchema.safeParse({
      payeeName: 'Kojo Mensah',
      payeePhoneE164: '0241234567', // Not E.164 +233
      amountGhs: 500,
    });
    expect(invalidPhone.success).toBe(false);

    const tooSmall = CreateChequeSchema.safeParse({
      payeeName: 'Kojo Mensah',
      payeePhoneE164: '+233241234567',
      amountGhs: 2, // min is 5
    });
    expect(tooSmall.success).toBe(false);

    const tooLarge = CreateChequeSchema.safeParse({
      payeeName: 'Kojo Mensah',
      payeePhoneE164: '+233241234567',
      amountGhs: 5000, // max is 2000 in V1
    });
    expect(tooLarge.success).toBe(false);
  });
});
