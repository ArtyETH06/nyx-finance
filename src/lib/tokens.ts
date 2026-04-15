import { formatAmount } from './unlink'

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
export const UNLKM_TOKEN_ADDRESS = '0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7'

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
    address: UNLKM_TOKEN_ADDRESS,
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
export const USDT = TOKENS.find(t => t.symbol === 'USDTm')!

export interface InvoiceTokenOption {
  symbol: 'UNLKm' | 'USDCm' | 'USDTm' | 'MON'
  address: string
  decimals: number
}

export type InvoiceTokenSymbol = InvoiceTokenOption['symbol']

// Invoice token options aligned with wallet deposit/withdraw tokens.
export const INVOICE_TOKEN_OPTIONS: InvoiceTokenOption[] = [
  { symbol: 'UNLKm', address: TOKENS.find((t) => t.symbol === 'UNLKm')!.address, decimals: TOKENS.find((t) => t.symbol === 'UNLKm')!.decimals },
  { symbol: 'USDCm', address: USDC.address, decimals: USDC.decimals },
  { symbol: 'USDTm', address: USDT.address, decimals: USDT.decimals },
  { symbol: 'MON', address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
]

export function getInvoiceTokenBySymbol(symbol: InvoiceTokenSymbol): InvoiceTokenOption {
  const found = INVOICE_TOKEN_OPTIONS.find((t) => t.symbol === symbol)
  if (!found) return INVOICE_TOKEN_OPTIONS[0]
  return found
}

export function getTokenByAddress(address?: string | null): Token | undefined {
  if (!address) return undefined
  return TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase())
}

export function displayAmount(amount: bigint, decimals: number): string {
  const formatted = formatAmount(amount, decimals)
  const dot = formatted.indexOf('.')
  if (dot === -1) return formatted
  return formatted.slice(0, dot + 3) // 2 decimal places
}

export function shortenAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
