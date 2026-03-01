import { Unlink, createMemoryStorage, parseZkAddress, type AccountView } from '@unlink-xyz/core'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

type RelayStatus = {
  state?: string
  txHash?: string
  error?: string
}

function isRelayNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as { status?: number; body?: { code?: string }; message?: string }
  if (anyErr.status === 404) return true
  if (anyErr.body?.code === 'not_found') return true
  return typeof anyErr.message === 'string' && anyErr.message.toLowerCase().includes('relay not found')
}

const DEFAULT_CHAIN = 'monad-testnet'
const DEFAULT_TIMEOUT_MS = 240_000
const POLL_INTERVAL_MS = 2_000
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTLEMENT_FILE = path.join(__dirname, '..', '..', '.data', 'settlement_mnemonic.txt')

let unlinkPromise: Promise<Unlink> | null = null

function env(name: string): string | undefined {
  const value = process.env[name]
  if (!value || !value.trim()) return undefined
  return value.trim()
}

function readLocalMnemonic(): string | null {
  try {
    if (!fs.existsSync(SETTLEMENT_FILE)) return null
    const value = fs.readFileSync(SETTLEMENT_FILE, 'utf-8').trim()
    return value || null
  } catch {
    return null
  }
}

function writeLocalMnemonic(value: string) {
  try {
    fs.mkdirSync(path.dirname(SETTLEMENT_FILE), { recursive: true })
    fs.writeFileSync(SETTLEMENT_FILE, value.trim(), 'utf-8')
  } catch {
    // non-fatal; runtime can still proceed in-memory
  }
}

function isLikelyHexCalldata(value?: string): boolean {
  if (!value) return false
  return /^0x[0-9a-fA-F]+$/.test(value) && value.length > 2
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
      const envMnemonic = env('NYX_SETTLEMENT_MNEMONIC')
      const localMnemonic = readLocalMnemonic()
      const mnemonic = envMnemonic ?? localMnemonic ?? undefined

      const unlink = await Unlink.create({
        chain: (env('NYX_UNLINK_CHAIN') ?? DEFAULT_CHAIN) as 'monad-testnet',
        storage: createMemoryStorage(),
        autoSync: false,
      })

      const seedExists = await unlink.seed.exists()
      if (!seedExists) {
        if (mnemonic) {
          await unlink.seed.importMnemonic(mnemonic, { overwrite: false })
          if (!envMnemonic) writeLocalMnemonic(mnemonic)
        } else {
          const created = await unlink.seed.create()
          writeLocalMnemonic(created.mnemonic)
          console.warn('[payment] NYX_SETTLEMENT_MNEMONIC is not set. Created local settlement mnemonic in .data/settlement_mnemonic.txt')
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
  recipientZkAddress?: string
  temporaryAccountIndex?: number
}) {
  const unlink = await getSettlementUnlink()
  let depositAccount: AccountView
  if (params.recipientZkAddress) {
    const parsed = parseZkAddress(params.recipientZkAddress)
    depositAccount = {
      address: params.recipientZkAddress,
      masterPublicKey: parsed.masterPublicKey,
      // Not needed for deposit calldata generation, but required by account view type shape.
      nullifyingKey: 0n,
      viewingKeyPair: {
        privateKey: new Uint8Array(32),
        pubkey: parsed.viewingPublicKey,
      },
    }
  } else {
    const accountIndex = params.temporaryAccountIndex ?? (await unlink.accounts.list()).length
    const existing = await unlink.accounts.get(accountIndex)
    depositAccount = existing ?? await unlink.accounts.create(accountIndex)
    await unlink.accounts.setActive(accountIndex)
  }

  const result = await unlink.deposit({
    depositor: params.depositor,
    deposits: [{ token: params.token, amount: params.amount }],
    account: depositAccount,
  })
  if (!result.to || !isLikelyHexCalldata(result.calldata)) {
    throw new Error('Failed to build valid deposit calldata')
  }
  return result
}

export async function confirmDepositRelay(params: {
  depositRelayId: string
}) {
  const unlink = await getSettlementUnlink()
  let status: RelayStatus
  try {
    status = await waitForRelaySuccess(unlink, params.depositRelayId)
    await unlink.confirmDeposit(params.depositRelayId)
  } catch (err) {
    if (!isRelayNotFoundError(err)) throw err
    await unlink.sync({ forceFullResync: true })
    status = { state: 'succeeded' }
  }

  return {
    relayId: params.depositRelayId,
    txHash: status.txHash,
  }
}

export async function confirmDepositAndSendPrivately(params: {
  depositRelayId: string
  token: string
  amount: bigint
  recipientZkAddress: string
  temporaryAccountIndex: number
}) {
  const unlink = await getSettlementUnlink()
  const existing = await unlink.accounts.get(params.temporaryAccountIndex)
  if (!existing) {
    await unlink.accounts.create(params.temporaryAccountIndex)
  }
  await unlink.accounts.setActive(params.temporaryAccountIndex)

  try {
    await waitForRelaySuccess(unlink, params.depositRelayId)
    await unlink.confirmDeposit(params.depositRelayId)
  } catch (err) {
    if (!isRelayNotFoundError(err)) throw err
    await unlink.sync({ forceFullResync: true })
  }
  await unlink.accounts.setActive(params.temporaryAccountIndex)

  for (let i = 0; i < 8; i += 1) {
    const bal = await unlink.getBalance(params.token)
    if (bal >= params.amount) break
    await unlink.sync({ forceFullResync: i === 0 })
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

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
