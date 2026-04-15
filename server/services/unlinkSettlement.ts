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

// 🚫 Toutes les fonctions unlink désactivées

export async function buildDepositForPayer() {
  throw new Error('Unlink feature removed')
}

export async function confirmDepositRelay() {
  throw new Error('Unlink feature removed')
}

export async function confirmDepositAndSendPrivately() {
  throw new Error('Unlink feature removed')
}

export async function getTemporaryZkAddress() {
  throw new Error('Unlink feature removed')
}