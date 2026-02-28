import { Wallet } from 'ethers'

export interface MockWalletIdentity {
  address: string
  privateKey: string
  publicKey: string
}

const ALCHEMY_PERSIST_KEY = 'nyx_alchemypay_testnet_wallet_v1'

function safeWindow(): Window | null {
  if (typeof window === 'undefined') return null
  return window
}

export function createEphemeralMonadWallet(): MockWalletIdentity {
  const wallet = Wallet.createRandom()
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.signingKey.publicKey,
  }
}

export function getOrCreatePersistentAlchemyPayWallet(): MockWalletIdentity {
  const win = safeWindow()
  if (!win) return createEphemeralMonadWallet()

  const raw = win.localStorage.getItem(ALCHEMY_PERSIST_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { privateKey?: string }
      if (parsed?.privateKey) {
        const restored = new Wallet(parsed.privateKey)
        return {
          address: restored.address,
          privateKey: restored.privateKey,
          publicKey: restored.signingKey.publicKey,
        }
      }
    } catch {
      // ignore broken local storage entry
    }
  }

  const created = createEphemeralMonadWallet()
  win.localStorage.setItem(ALCHEMY_PERSIST_KEY, JSON.stringify({ privateKey: created.privateKey }))
  return created
}
