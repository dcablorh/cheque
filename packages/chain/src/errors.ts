export enum ContractErrorCode {
  AlreadyInitialized = 1,
  NotInitialized = 2,
  Unauthorized = 3,
  ChequeAlreadyExists = 4,
  ChequeNotFound = 5,
  InvalidState = 6,
  ChequeExpired = 7,
  ChequeNotExpired = 8,
  AmountOutOfBounds = 9,
  LockExpired = 10,
  LockNotExpired = 11,
  DelayNotMet = 12,
  DelayPassed = 13,
  ContractPaused = 14,
  InvalidLockDuration = 15,
  NoPendingAdmin = 16,
  InvalidExpiry = 17,
}

export const CONTRACT_ERROR_MESSAGES: Record<ContractErrorCode, string> = {
  [ContractErrorCode.AlreadyInitialized]: 'Contract is already initialized',
  [ContractErrorCode.NotInitialized]: 'Contract is not initialized',
  [ContractErrorCode.Unauthorized]: 'Caller is not authorized for this operation',
  [ContractErrorCode.ChequeAlreadyExists]: 'A cheque with this ID already exists',
  [ContractErrorCode.ChequeNotFound]: 'Cheque not found',
  [ContractErrorCode.InvalidState]: 'Operation is invalid for the cheque current state',
  [ContractErrorCode.ChequeExpired]: 'Cheque has expired and can no longer be locked or claimed',
  [ContractErrorCode.ChequeNotExpired]: 'Cheque has not expired yet; cannot refund',
  [ContractErrorCode.AmountOutOfBounds]: 'Cheque amount is below min or above max configuration',
  [ContractErrorCode.LockExpired]: 'Claim lock has expired',
  [ContractErrorCode.LockNotExpired]: 'Claim lock has not expired yet',
  [ContractErrorCode.DelayNotMet]: 'Timelock delay requirement has not been met yet',
  [ContractErrorCode.DelayPassed]: 'Timelock delay has already passed; veto no longer possible',
  [ContractErrorCode.ContractPaused]: 'Contract is paused by emergency admin',
  [ContractErrorCode.InvalidLockDuration]: 'Requested lock duration exceeds max_lock_secs or is zero',
  [ContractErrorCode.NoPendingAdmin]: 'No pending admin transfer to accept',
  [ContractErrorCode.InvalidExpiry]: 'Cheque expiry timestamp must be in the future',
};

export class ContractError extends Error {
  public readonly code: ContractErrorCode;
  public readonly codeName: string;
  public readonly userMessage: string;

  constructor(code: ContractErrorCode, customMessage?: string) {
    const codeName = ContractErrorCode[code] ?? 'UnknownError';
    const explanation = CONTRACT_ERROR_MESSAGES[code] ?? 'Unknown contract error';
    const message = customMessage
      ? `${codeName} (${code}): ${explanation} - ${customMessage}`
      : `${codeName} (${code}): ${explanation}`;

    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.codeName = codeName;
    this.userMessage = explanation;
  }
}

/**
 * Parses Soroban RPC simulation or execution error and extracts typed ContractError if present.
 */
export function parseContractError(err: unknown): Error {
  if (err instanceof ContractError) return err;

  const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err);

  // Match Error(Contract, #) or Error(Contract, 4) or similar from Soroban RPC strings
  const match = /Error\(Contract,\s*#?(\d+)\)/.exec(msg);
  if (match) {
    const code = parseInt(match[1], 10);
    if (code in ContractErrorCode) {
      return new ContractError(code as ContractErrorCode);
    }
  }

  // Check if error object directly contains contract code
  if (typeof err === 'object' && err !== null) {
    const codeProp = (err as Record<string, unknown>).code;
    if (typeof codeProp === 'number' && codeProp in ContractErrorCode) {
      return new ContractError(codeProp as ContractErrorCode);
    }
  }

  return err instanceof Error ? err : new Error(msg);
}
