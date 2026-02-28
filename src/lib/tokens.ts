import { formatAmount } from '@unlink-xyz/react'

export interface Token {
  address: string
  symbol: string
  decimals: number
  name: string
}

// Token registry for monad-testnet.
// Set VITE_USDC_ADDRESS in your .env to the USDC contract address.
// Get the address from https://faucet.unlink.xyz
export const TOKENS: Token[] = [
  {
    address: (import.meta.env.VITE_USDC_ADDRESS as string) || '',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin',
  },
]

export const USDC = TOKENS[0]

export function getTokenByAddress(address: string): Token | undefined {
  return TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase())
}

export function displayAmount(amount: bigint, decimals: number): string {
  return formatAmount(amount, decimals)
}

export function shortenAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
