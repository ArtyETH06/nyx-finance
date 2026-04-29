export function toBaseUnits(amount: number, decimals = 18): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid invoice amount')
  }

  const value = amount.toFixed(decimals)
  const [whole, fraction = ''] = value.split('.')
  const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals)
  const normalized = `${whole}${paddedFraction}`.replace(/^0+/, '') || '0'
  return BigInt(normalized)
}

export interface BuildDepositForPayerParams {
  depositor: string
  token: string
  amount: bigint
  recipientZkAddress?: string
}

export interface DepositPayload {
  relayId: string
  to: string
  calldata: string
  value: bigint
}

export interface ConfirmDepositRelayParams {
  depositRelayId: string
}

export interface ConfirmDepositRelayResult {
  relayId: string
  txHash?: string
}

// Unlink is intentionally disabled, but these stubs keep the server API
// contract type-safe for Vercel's function compiler.
function unlinkUnavailable(): never {
  throw new Error('Unlink feature removed')
}

export async function buildDepositForPayer(_params: BuildDepositForPayerParams): Promise<DepositPayload> {
  unlinkUnavailable()
}

export async function confirmDepositRelay(_params: ConfirmDepositRelayParams): Promise<ConfirmDepositRelayResult> {
  unlinkUnavailable()
}

export async function confirmDepositAndSendPrivately() {
  unlinkUnavailable()
}

export async function getTemporaryZkAddress() {
  unlinkUnavailable()
}
