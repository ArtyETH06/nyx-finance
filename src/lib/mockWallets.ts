import { Wallet } from 'ethers'

export interface MockWalletIdentity {
  address: string
  privateKey: string
  publicKey: string
}

// Shared mock AlchemyPay wallet across all browser sessions/routes.
// Override with VITE_ALCHEMY_TESTNET_PRIVATE_KEY if you want to control it from env.
const DEFAULT_ALCHEMY_TESTNET_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f094538c5f3d9e2a6e3f68b31f4be7f5a0f26f0f'

function resolveAlchemyPrivateKey(): string {
  const envKey = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ALCHEMY_TESTNET_PRIVATE_KEY
  const candidate = (envKey ?? DEFAULT_ALCHEMY_TESTNET_PRIVATE_KEY).trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(candidate)) {
    return DEFAULT_ALCHEMY_TESTNET_PRIVATE_KEY
  }
  return candidate
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
  const wallet = new Wallet(resolveAlchemyPrivateKey())
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.signingKey.publicKey,
  }
}
