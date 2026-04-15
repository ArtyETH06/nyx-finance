import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createUnlink,
  createUnlinkClient,
  getTransaction,
  unlinkAccount,
  unlinkEvm,
  UnlinkApiError,
  UnlinkCapabilityError,
  type EnsureErc20ApprovalResult,
  type Permit2TypedData,
  type Permit2WitnessTypedData,
  type UnlinkClient,
  type UnlinkEvmProvider,
} from '@unlink-xyz/sdk'
import { formatUnits, parseUnits } from 'viem'
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts'

type ActiveAccount = {
  address: string
  index: number
}

type SendInput = {
  token: string
  recipient: string
  amount: bigint
}

type DepositInput = {
  token: string
  amount: bigint
  depositor: string
}

type WithdrawInput = {
  token: string
  amount: bigint
  recipient: string
}

type RelayResult = {
  relayId: string
  status: string
}

type TxStatus = {
  txId: string
  state: string
  txHash?: string
  error?: string
}

type WaitForConfirmationOptions = {
  timeout?: number
}

type EnsureApprovalInput = {
  token: string
  amount: bigint | string
  evmAddress: string
}

type UnlinkContextValue = {
  ready: boolean
  walletExists: boolean
  activeAccount: ActiveAccount | null
  balances: Record<string, bigint>
  balancesLoading: boolean
  busy: boolean
  syncError: string | null
  createWallet(): Promise<{ mnemonic: string }>
  importWallet(mnemonic: string): Promise<void>
  exportMnemonic(): Promise<string>
  clearWallet(): Promise<void>
  createAccount(index?: number): Promise<ActiveAccount>
  send(params: SendInput[]): Promise<RelayResult>
  deposit(params: DepositInput[]): Promise<RelayResult>
  withdraw(params: WithdrawInput[]): Promise<RelayResult>
  refresh(): Promise<void>
  forceResync(): Promise<void>
  getTxStatus(txId: string): Promise<TxStatus>
  waitForConfirmation(txId: string, options?: WaitForConfirmationOptions): Promise<TxStatus>
  ensureErc20Approval(params: EnsureApprovalInput): Promise<EnsureErc20ApprovalResult>
}

const STORAGE_KEYS = {
  mnemonic: 'nyx_unlink_mnemonic_v1',
  accountIndex: 'nyx_unlink_account_index_v1',
  schemaVersion: 'nyx_unlink_wallet_schema_v1',
  balanceCachePrefix: 'nyx_unlink_balance_cache_v1:',
} as const

const LEGACY_DB_NAME = 'unlink-wallet'
const CURRENT_WALLET_SCHEMA_VERSION = '2'

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 180000
const BACKGROUND_SYNC_INTERVAL_MS = 30000

const UnlinkContext = createContext<UnlinkContextValue | null>(null)

function getUnlinkConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {}
  const engineUrl = env.VITE_UNLINK_ENGINE_URL?.trim()
  const apiKey = env.VITE_UNLINK_API_KEY?.trim()

  if (!engineUrl || !apiKey) {
    return {
      engineUrl: null,
      apiKey: null,
      error: 'Unlink is not configured. Set VITE_UNLINK_ENGINE_URL and VITE_UNLINK_API_KEY.',
    }
  }

  return {
    engineUrl,
    apiKey,
    error: null,
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof UnlinkApiError) {
    return error.detail ? `${error.code}: ${error.detail}` : error.message
  }
  if (error instanceof UnlinkCapabilityError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unexpected Unlink error'
}

function readStoredMnemonic(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEYS.mnemonic)
}

function writeStoredMnemonic(mnemonic: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEYS.mnemonic, mnemonic)
}

function clearStoredMnemonic() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEYS.mnemonic)
}

function readStoredAccountIndex(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEYS.accountIndex)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function writeStoredAccountIndex(index: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEYS.accountIndex, String(index))
}

function clearStoredAccountIndex() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEYS.accountIndex)
}

function readStoredSchemaVersion(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEYS.schemaVersion)
}

function writeStoredSchemaVersion(value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEYS.schemaVersion, value)
}

function balanceCacheKey(address: string): string {
  return `${STORAGE_KEYS.balanceCachePrefix}${address.toLowerCase()}`
}

function readCachedBalances(address?: string | null): Record<string, bigint> {
  if (typeof window === 'undefined' || !address) return {}

  const raw = window.localStorage.getItem(balanceCacheKey(address))
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return Object.fromEntries(
      Object.entries(parsed).map(([token, amount]) => [token, BigInt(amount)])
    )
  } catch {
    return {}
  }
}

function writeCachedBalances(address: string, balances: Record<string, bigint>) {
  if (typeof window === 'undefined') return
  const serialized = Object.fromEntries(
    Object.entries(balances).map(([token, amount]) => [token, amount.toString()])
  )
  window.localStorage.setItem(balanceCacheKey(address), JSON.stringify(serialized))
}

function clearCachedBalances(address?: string | null) {
  if (typeof window === 'undefined' || !address) return
  window.localStorage.removeItem(balanceCacheKey(address))
}

function clearAllCachedBalances() {
  if (typeof window === 'undefined') return
  const keysToDelete: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(STORAGE_KEYS.balanceCachePrefix)) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    window.localStorage.removeItem(key)
  }
}

function toAmountString(amount: bigint | string): string {
  return typeof amount === 'bigint' ? amount.toString() : amount
}

function addBalanceAliases(target: Record<string, bigint>, token: string, amount: bigint) {
  target[token] = amount
  target[token.toLowerCase()] = amount
}

function toBalanceRecord(data: { balances: Array<{ token: string; amount: string }> }): Record<string, bigint> {
  const next: Record<string, bigint> = {}
  for (const entry of data.balances) {
    addBalanceAliases(next, entry.token, BigInt(entry.amount))
  }
  return next
}

function buildTypedDataPayload(typedData: Permit2TypedData | Permit2WitnessTypedData) {
  return {
    domain: typedData.domain,
    primaryType: typedData.primaryType,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...typedData.types,
    },
    message: typedData.value,
  }
}

function createBrowserEvmProvider(address: string): UnlinkEvmProvider {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet provider found')
  }

  return unlinkEvm.fromSigner({
    address,
    async signTypedData(typedData) {
      const signature = await window.ethereum!.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(buildTypedDataPayload(typedData))],
      })
      if (typeof signature !== 'string') {
        throw new Error('Wallet did not return a signature')
      }
      return signature
    },
    async getErc20Allowance(params) {
      const data =
        `0xdd62ed3e${params.owner.slice(2).padStart(64, '0')}${params.spender.slice(2).padStart(64, '0')}`
      const result = await window.ethereum!.request({
        method: 'eth_call',
        params: [{ to: params.token, data }, 'latest'],
      })
      return typeof result === 'string' && result !== '0x' ? BigInt(result) : 0n
    },
    async sendTransaction(tx) {
      const params: Record<string, string> = {
        from: address,
        to: tx.to,
        data: tx.data,
      }
      if (typeof tx.value === 'bigint' && tx.value > 0n) {
        params.value = `0x${tx.value.toString(16)}`
      }
      const txHash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [params],
      })
      if (typeof txHash !== 'string') {
        throw new Error('Wallet did not return a transaction hash')
      }
      return txHash
    },
  })
}

async function deleteLegacyWalletDb(): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

async function resetWalletStorage() {
  clearStoredMnemonic()
  clearStoredAccountIndex()
  clearAllCachedBalances()
  await deleteLegacyWalletDb()
}

async function prepareWalletStorage() {
  if (typeof window === 'undefined') return
  if (readStoredSchemaVersion() === CURRENT_WALLET_SCHEMA_VERSION) return

  await resetWalletStorage()
  writeStoredSchemaVersion(CURRENT_WALLET_SCHEMA_VERSION)
}

export function parseAmount(value: string, decimals: number): bigint {
  const normalized = value.trim()
  return normalized ? parseUnits(normalized, decimals) : 0n
}

export function formatAmount(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
}

export function UnlinkProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => getUnlinkConfig(), [])

  const [ready, setReady] = useState(false)
  const [walletExists, setWalletExists] = useState(false)
  const [activeAccount, setActiveAccount] = useState<ActiveAccount | null>(null)
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [mutationCount, setMutationCount] = useState(0)

  const pendingMnemonicRef = useRef<string | null>(null)
  const clientRef = useRef<UnlinkClient | null>(null)
  const apiClientRef = useRef<ReturnType<typeof createUnlinkClient> | null>(null)
  const activeAccountRef = useRef<ActiveAccount | null>(null)

  useEffect(() => {
    activeAccountRef.current = activeAccount
  }, [activeAccount])

  const runMutation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setMutationCount((count) => count + 1)
    try {
      return await fn()
    } finally {
      setMutationCount((count) => Math.max(0, count - 1))
    }
  }, [])

  const refreshWithClient = useCallback(async (clientOverride?: UnlinkClient | null, addressOverride?: string | null) => {
    const client = clientOverride ?? clientRef.current
    const address = addressOverride ?? activeAccountRef.current?.address ?? null

    if (!address) {
      setBalances({})
      setSyncError(null)
      return
    }

    if (!client) {
      if (config.error) {
        setSyncError(config.error)
      }
      return
    }

    setBalancesLoading(true)
    try {
      await client.ensureRegistered()
      const next = toBalanceRecord(await client.getBalances())
      writeCachedBalances(address, next)
      setBalances(next)
      setSyncError(null)
    } catch (error) {
      setSyncError(normalizeErrorMessage(error))
      const cached = readCachedBalances(address)
      if (Object.keys(cached).length > 0) {
        setBalances(cached)
      }
      throw error instanceof Error ? error : new Error(normalizeErrorMessage(error))
    } finally {
      setBalancesLoading(false)
    }
  }, [config.error])

  const activateAccountFromMnemonic = useCallback(async (
    mnemonic: string,
    accountIndex: number,
    options?: { refresh?: boolean }
  ) => {
    const accountProvider = unlinkAccount.fromMnemonic({ mnemonic, accountIndex })
    const keys = await accountProvider.getAccountKeys()
    const nextAccount = { address: keys.address, index: accountIndex }

    writeStoredMnemonic(mnemonic)
    writeStoredAccountIndex(accountIndex)
    pendingMnemonicRef.current = null

    setWalletExists(true)
    setActiveAccount(nextAccount)
    setBalances(readCachedBalances(keys.address))

    if (config.engineUrl && config.apiKey) {
      clientRef.current = createUnlink({
        engineUrl: config.engineUrl,
        apiKey: config.apiKey,
        account: accountProvider,
      })
      apiClientRef.current = createUnlinkClient(config.engineUrl, config.apiKey)
      setSyncError(null)
      if (options?.refresh !== false) {
        void refreshWithClient(clientRef.current, keys.address).catch(() => {})
      }
    } else {
      clientRef.current = null
      apiClientRef.current = null
      setSyncError(config.error)
    }

    return nextAccount
  }, [config.apiKey, config.engineUrl, config.error, refreshWithClient])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        await prepareWalletStorage()
        const mnemonic = readStoredMnemonic()
        const accountIndex = readStoredAccountIndex() ?? 0

        if (!mnemonic) {
          if (!cancelled) {
            clientRef.current = null
            apiClientRef.current = null
            setWalletExists(false)
            setActiveAccount(null)
            setBalances({})
            setSyncError(null)
          }
          return
        }

        if (!cancelled) {
          await activateAccountFromMnemonic(mnemonic, accountIndex, { refresh: false })
        }
      } catch (error) {
        if (!cancelled) {
          setSyncError(normalizeErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activateAccountFromMnemonic])

  useEffect(() => {
    if (!ready || !activeAccount) return
    if (!clientRef.current) return

    void refreshWithClient(clientRef.current, activeAccount.address).catch(() => {})

    const timer = window.setInterval(() => {
      void refreshWithClient().catch(() => {})
    }, BACKGROUND_SYNC_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [activeAccount, ready, refreshWithClient])

  const requireClient = useCallback(() => {
    if (!clientRef.current) {
      throw new Error(config.error ?? 'Unlink client is not ready')
    }
    return clientRef.current
  }, [config.error])

  const requireApiClient = useCallback(() => {
    if (!apiClientRef.current) {
      throw new Error(config.error ?? 'Unlink client is not ready')
    }
    return apiClientRef.current
  }, [config.error])

  const createWallet = useCallback(() => runMutation(async () => {
    if (pendingMnemonicRef.current) {
      return { mnemonic: pendingMnemonicRef.current }
    }
    if (readStoredMnemonic()) {
      throw new Error('Wallet already exists')
    }
    const mnemonic = generateMnemonic(english)
    pendingMnemonicRef.current = mnemonic
    return { mnemonic }
  }), [runMutation])

  const importWallet = useCallback((mnemonic: string) => runMutation(async () => {
    const normalized = mnemonic.trim().replace(/\s+/g, ' ')
    mnemonicToAccount(normalized)
    await activateAccountFromMnemonic(normalized, 0)
  }), [activateAccountFromMnemonic, runMutation])

  const exportMnemonic = useCallback(() => runMutation(async () => {
    const mnemonic = readStoredMnemonic()
    if (!mnemonic) {
      throw new Error('No wallet exists. Create or import a wallet first.')
    }
    return mnemonic
  }), [runMutation])

  const clearWallet = useCallback(() => runMutation(async () => {
    const currentAddress = activeAccountRef.current?.address ?? null
    pendingMnemonicRef.current = null
    clientRef.current = null
    apiClientRef.current = null
    clearStoredMnemonic()
    clearStoredAccountIndex()
    clearCachedBalances(currentAddress)
    clearAllCachedBalances()
    setWalletExists(false)
    setActiveAccount(null)
    setBalances({})
    setSyncError(null)
    await deleteLegacyWalletDb()
  }), [runMutation])

  const createAccount = useCallback((index?: number) => runMutation(async () => {
    const mnemonic = readStoredMnemonic() ?? pendingMnemonicRef.current
    if (!mnemonic) {
      throw new Error('No wallet exists. Create or import a wallet first.')
    }
    const accountIndex = index ?? readStoredAccountIndex() ?? 0
    return activateAccountFromMnemonic(mnemonic, accountIndex)
  }), [activateAccountFromMnemonic, runMutation])

  const refresh = useCallback(async () => {
    await refreshWithClient()
  }, [refreshWithClient])

  const forceResync = useCallback(async () => {
    setSyncError(null)
    await refreshWithClient()
  }, [refreshWithClient])

  const ensureErc20Approval = useCallback((params: EnsureApprovalInput) => runMutation(async () => {
    const client = requireClient()
    return client.ensureErc20Approval({
      token: params.token,
      amount: toAmountString(params.amount),
      evm: createBrowserEvmProvider(params.evmAddress),
    })
  }), [requireClient, runMutation])

  const send = useCallback((params: SendInput[]) => runMutation(async () => {
    if (params.length === 0) {
      throw new Error('Transfer requires at least one recipient')
    }

    const client = requireClient()
    const token = params[0].token

    if (params.some((item) => item.token.toLowerCase() !== token.toLowerCase())) {
      throw new Error('Mixed-token private transfers are not supported in this client')
    }

    const result = params.length === 1
      ? await client.transfer({
        token,
        amount: params[0].amount.toString(),
        recipientAddress: params[0].recipient,
      })
      : await client.transfer({
        token,
        transfers: params.map((item) => ({
          recipientAddress: item.recipient,
          amount: item.amount.toString(),
        })),
      })

    return { relayId: result.txId, status: result.status }
  }), [requireClient, runMutation])

  const deposit = useCallback((params: DepositInput[]) => runMutation(async () => {
    if (params.length !== 1) {
      throw new Error('Only single-token deposits are supported')
    }

    const [input] = params
    const client = requireClient()
    const result = await client.deposit({
      token: input.token,
      amount: input.amount.toString(),
      evm: createBrowserEvmProvider(input.depositor),
    })

    return { relayId: result.txId, status: result.status }
  }), [requireClient, runMutation])

  const withdraw = useCallback((params: WithdrawInput[]) => runMutation(async () => {
    if (params.length !== 1) {
      throw new Error('Only single-token withdrawals are supported')
    }

    const [input] = params
    const client = requireClient()
    const result = await client.withdraw({
      token: input.token,
      amount: input.amount.toString(),
      recipientEvmAddress: input.recipient,
    })

    return { relayId: result.txId, status: result.status }
  }), [requireClient, runMutation])

  const getTxStatus = useCallback(async (txId: string) => {
    const apiClient = requireApiClient()
    const tx = await getTransaction(apiClient, txId)
    return {
      txId: tx.id,
      state: tx.status,
      txHash: tx.tx_hash ?? undefined,
    }
  }, [requireApiClient])

  const waitForConfirmation = useCallback(async (txId: string, options?: WaitForConfirmationOptions) => {
    const client = requireClient()
    const final = await client.pollTransactionStatus(txId, {
      timeoutMs: options?.timeout ?? DEFAULT_CONFIRMATION_TIMEOUT_MS,
    })

    if (final.status === 'failed') {
      throw new Error(`Transaction ${txId} failed`)
    }

    try {
      const status = await getTxStatus(txId)
      if (status.state === 'failed') {
        throw new Error(`Transaction ${txId} failed`)
      }
      return status
    } catch (error) {
      if (error instanceof Error && error.message.includes('failed')) {
        throw error
      }
      return {
        txId: final.txId,
        state: final.status,
      }
    }
  }, [getTxStatus, requireClient])

  const value = useMemo<UnlinkContextValue>(() => ({
    ready,
    walletExists,
    activeAccount,
    balances,
    balancesLoading,
    busy: mutationCount > 0,
    syncError,
    createWallet,
    importWallet,
    exportMnemonic,
    clearWallet,
    createAccount,
    send,
    deposit,
    withdraw,
    refresh,
    forceResync,
    getTxStatus,
    waitForConfirmation,
    ensureErc20Approval,
  }), [
    activeAccount,
    balances,
    balancesLoading,
    clearWallet,
    createAccount,
    createWallet,
    deposit,
    ensureErc20Approval,
    exportMnemonic,
    forceResync,
    getTxStatus,
    importWallet,
    mutationCount,
    ready,
    refresh,
    send,
    syncError,
    waitForConfirmation,
    walletExists,
    withdraw,
  ])

  return <UnlinkContext.Provider value={value}>{children}</UnlinkContext.Provider>
}

export function useUnlink(): UnlinkContextValue {
  const context = useContext(UnlinkContext)
  if (!context) {
    throw new Error('useUnlink must be used within UnlinkProvider')
  }
  return context
}

export function useUnlinkBalances() {
  const { balances, ready, balancesLoading } = useUnlink()
  return {
    balances,
    ready,
    loading: !ready || balancesLoading,
  }
}
