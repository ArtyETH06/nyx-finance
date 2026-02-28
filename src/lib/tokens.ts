import { formatAmount } from '@unlink-xyz/react'

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

export interface Token {
  address: string
  symbol: string
  decimals: number
  name: string
  isNative?: boolean
}

// Token registry for monad-testnet.
export const TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'MON',
    decimals: 18,
    name: 'Monad (native)',
    isNative: true,
  },
  {
    address: '0xaaa4e95d4da878baf8e10745fdf26e196918df6b',
    symbol: 'UNLKm',
    decimals: 18,
    name: 'Unlink (monad testnet)',
  },
  {
    address: '0xc4fb617e4e4cfbdeb07216dff62b4e46a2d6fdf6',
    symbol: 'USDCm',
    decimals: 18,
    name: 'USD Coin (monad testnet)',
  },
  {
    address: '0x86b6341d3c56bc379697d247fc080f5f2c8eed7b',
    symbol: 'USDTm',
    decimals: 18,
    name: 'Tether USD (monad testnet)',
  },
]

export const USDC = TOKENS.find(t => t.symbol === 'USDCm')!

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
