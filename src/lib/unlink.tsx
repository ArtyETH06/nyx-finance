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

type EnsureErc20ApprovalResult =
  | { status: 'submitted'; txHash: string }
  | { status: 'approved' | 'already_approved' | 'disabled'; txHash?: string }

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
} as const

const UnlinkContext = createContext<UnlinkContextValue | null>(null)

function unlinkDisabled(): never {
  throw new Error('Unlink private wallet features are disabled in this build.')
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

function readStoredAccountIndex(): number {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(STORAGE_KEYS.accountIndex)
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function writeStoredAccountIndex(index: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEYS.accountIndex, String(index))
}

function clearStoredAccountIndex() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEYS.accountIndex)
}

function accountFromMnemonic(mnemonic: string, index: number): ActiveAccount {
  const account = mnemonicToAccount(mnemonic, { accountIndex: index })
  return { address: account.address, index }
}

export function parseAmount(value: string, decimals: number): bigint {
  const normalized = value.trim()
  return normalized ? parseUnits(normalized, decimals) : 0n
}

export function formatAmount(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
}

export function UnlinkProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [walletExists, setWalletExists] = useState(false)
  const [activeAccount, setActiveAccount] = useState<ActiveAccount | null>(null)
  const [mutationCount, setMutationCount] = useState(0)
  const pendingMnemonicRef = useRef<string | null>(null)
  const activeAccountRef = useRef<ActiveAccount | null>(null)

  useEffect(() => {
    activeAccountRef.current = activeAccount
  }, [activeAccount])

  useEffect(() => {
    const mnemonic = readStoredMnemonic()
    if (mnemonic) {
      const account = accountFromMnemonic(mnemonic, readStoredAccountIndex())
      setWalletExists(true)
      setActiveAccount(account)
    }
    setReady(true)
  }, [])

  const runMutation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setMutationCount((count) => count + 1)
    try {
      return await fn()
    } finally {
      setMutationCount((count) => Math.max(0, count - 1))
    }
  }, [])

  const activateAccountFromMnemonic = useCallback(async (mnemonic: string, index: number) => {
    const account = accountFromMnemonic(mnemonic, index)
    writeStoredMnemonic(mnemonic)
    writeStoredAccountIndex(index)
    pendingMnemonicRef.current = null
    setWalletExists(true)
    setActiveAccount(account)
    return account
  }, [])

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
    accountFromMnemonic(normalized, 0)
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
    pendingMnemonicRef.current = null
    activeAccountRef.current = null
    clearStoredMnemonic()
    clearStoredAccountIndex()
    setWalletExists(false)
    setActiveAccount(null)
  }), [runMutation])

  const createAccount = useCallback((index?: number) => runMutation(async () => {
    const mnemonic = readStoredMnemonic() ?? pendingMnemonicRef.current
    if (!mnemonic) {
      throw new Error('No wallet exists. Create or import a wallet first.')
    }
    return activateAccountFromMnemonic(mnemonic, index ?? readStoredAccountIndex())
  }), [activateAccountFromMnemonic, runMutation])

  const refresh = useCallback(async () => {}, [])
  const forceResync = useCallback(async () => {}, [])

  const send = useCallback((_params: SendInput[]) => runMutation(async () => unlinkDisabled()), [runMutation])
  const deposit = useCallback((_params: DepositInput[]) => runMutation(async () => unlinkDisabled()), [runMutation])
  const withdraw = useCallback((_params: WithdrawInput[]) => runMutation(async () => unlinkDisabled()), [runMutation])
  const getTxStatus = useCallback(async (_txId: string) => unlinkDisabled(), [])
  const waitForConfirmation = useCallback(async (_txId: string, _options?: WaitForConfirmationOptions) => unlinkDisabled(), [])
  const ensureErc20Approval = useCallback((_params: EnsureApprovalInput) => runMutation(async () => unlinkDisabled()), [runMutation])

  const value = useMemo<UnlinkContextValue>(() => ({
    ready,
    walletExists,
    activeAccount,
    balances: {},
    balancesLoading: false,
    busy: mutationCount > 0,
    syncError: null,
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
