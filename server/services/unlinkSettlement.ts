import { Unlink, createMemoryStorage } from '@unlink-xyz/core'

type RelayStatus = {
  state?: string
  txHash?: string
  error?: string
}

const DEFAULT_CHAIN = 'monad-testnet'
const DEFAULT_TIMEOUT_MS = 240_000
const POLL_INTERVAL_MS = 2_000

let unlinkPromise: Promise<Unlink> | null = null

function env(name: string): string | undefined {
  const value = process.env[name]
  if (!value || !value.trim()) return undefined
  return value.trim()
}

async function waitForRelaySuccess(unlink: Unlink, relayId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RelayStatus> {
  const startedAt = Date.now()
  let lastState = 'unknown'

  while (Date.now() - startedAt <= timeoutMs) {
    const status = await unlink.getTxStatus(relayId) as RelayStatus
    const state = String(status.state ?? '').toLowerCase()
    lastState = state || lastState

    if (state === 'succeeded') return status
    if (state === 'failed') {
      throw new Error(status.error || `Relay ${relayId} failed`)
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`Timed out waiting for relay ${relayId} (${lastState})`)
}

async function getSettlementUnlink(): Promise<Unlink> {
  if (!unlinkPromise) {
    unlinkPromise = (async () => {
      const mnemonic = env('NYX_SETTLEMENT_MNEMONIC')

      const unlink = await Unlink.create({
        chain: (env('NYX_UNLINK_CHAIN') ?? DEFAULT_CHAIN) as 'monad-testnet',
        storage: createMemoryStorage(),
        autoSync: false,
      })

      const seedExists = await unlink.seed.exists()
      if (!seedExists) {
        if (mnemonic) {
          await unlink.seed.importMnemonic(mnemonic, { overwrite: false })
        } else {
          await unlink.seed.create()
          console.warn('[payment] NYX_SETTLEMENT_MNEMONIC is not set. Using ephemeral in-memory settlement wallet for this process.')
        }
      }

      const active = await unlink.accounts.getActive()
      if (!active) {
        await unlink.accounts.create(0)
      }

      return unlink
    })()
  }
  return unlinkPromise
}

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

export async function buildDepositForPayer(params: {
  depositor: string
  token: string
  amount: bigint
  temporaryAccountIndex?: number
}) {
  const unlink = await getSettlementUnlink()
  const accountIndex = params.temporaryAccountIndex ?? (await unlink.accounts.list()).length
  const existing = await unlink.accounts.get(accountIndex)
  const temporaryAccount = existing ?? await unlink.accounts.create(accountIndex)

  await unlink.accounts.setActive(accountIndex)
  return unlink.deposit({
    depositor: params.depositor,
    deposits: [{ token: params.token, amount: params.amount }],
    account: temporaryAccount,
  })
}

export async function confirmDepositAndSendPrivately(params: {
  depositRelayId: string
  token: string
  amount: bigint
  recipientZkAddress: string
  temporaryAccountIndex: number
}) {
  const unlink = await getSettlementUnlink()
  await unlink.accounts.setActive(params.temporaryAccountIndex)

  await waitForRelaySuccess(unlink, params.depositRelayId)
  await unlink.confirmDeposit(params.depositRelayId)
  await unlink.accounts.setActive(params.temporaryAccountIndex)

  const sendResult = await unlink.send({
    transfers: [{
      token: params.token,
      recipient: params.recipientZkAddress,
      amount: params.amount,
    }],
  })

  const sendStatus = await waitForRelaySuccess(unlink, sendResult.relayId)
  return {
    relayId: sendResult.relayId,
    txHash: sendStatus.txHash,
  }
}

export async function getTemporaryZkAddress(accountIndex?: number): Promise<{ index: number; address: string }> {
  const unlink = await getSettlementUnlink()
  const index = accountIndex ?? (await unlink.accounts.list()).length
  const account = await unlink.accounts.create(index)
  return { index, address: account.address }
}
