import { Interface, JsonRpcProvider, Wallet, parseUnits } from 'ethers'
import { getOrCreatePersistentAlchemyPayWallet } from './mockWallets'
import { NATIVE_TOKEN_ADDRESS, UNLKM_TOKEN_ADDRESS } from './tokens'

type FiatToken = 'MON' | 'USDCm' | 'USDT' | 'UNLKm'
type FiatCurrency = 'USD' | 'EUR'

const TOKEN_BY_SYMBOL: Record<Exclude<FiatToken, 'MON'>, string> = {
  USDCm: '0xc4fb617e4e4cfbdeb07216dff62b4e46a2d6fdf6',
  USDT: '0x86b6341d3c56bc379697d247fc080f5f2c8eed7b',
  UNLKm: UNLKM_TOKEN_ADDRESS,
}

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
]
const erc20Interface = new Interface(ERC20_ABI)

function usdToTokenRate(token: FiatToken): number {
  if (token === 'MON') return 50
  if (token === 'USDCm') return 1
  if (token === 'USDT') return 1
  return 2 // UNLKm
}

function toAmountString(value: number, maxDecimals = 6): string {
  return value.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  })
}

function resolveRpcUrl(): string {
  const configured = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_MONAD_RPC_URL
  if (configured && configured.trim() && !configured.toLowerCase().includes('quicknode')) {
    return configured.trim()
  }
  return 'https://monad-testnet.g.alchemy.com/v2/lj2xftxNKQ7eSHtLRji-o'
}

function computeTokenAmount(params: { payAmount: number; currency: FiatCurrency; token: FiatToken }): number {
  const usd = params.currency === 'USD' ? params.payAmount : params.payAmount * 1.1
  return usd * usdToTokenRate(params.token)
}

export async function sendMockAlchemyPayment(params: {
  destinationAddress: string
  payAmount: number
  currency: FiatCurrency
  token: FiatToken
}): Promise<{ txHash: string; tokenAmount: string }> {
  const walletInfo = getOrCreatePersistentAlchemyPayWallet()
  const provider = new JsonRpcProvider(resolveRpcUrl())
  const signer = new Wallet(walletInfo.privateKey, provider)

  const tokenAmount = computeTokenAmount({
    payAmount: params.payAmount,
    currency: params.currency,
    token: params.token,
  })
  const tokenAmountStr = toAmountString(tokenAmount)
  const amountUnits = parseUnits(tokenAmountStr, 18)

  if (params.token === 'MON') {
    const balance = await provider.getBalance(signer.address)
    const gasReserve = parseUnits('0.01', 18)
    if (balance < amountUnits + gasReserve) {
      throw new Error('AlchemyPay Testnet wallet has insufficient MON for value + gas')
    }

    const tx = await signer.sendTransaction({
      to: params.destinationAddress,
      value: amountUnits,
      gasLimit: 21000n,
    })
    await tx.wait(1)
    return { txHash: tx.hash, tokenAmount: tokenAmountStr }
  }

  const tokenAddress = TOKEN_BY_SYMBOL[params.token]
  const data = erc20Interface.encodeFunctionData('transfer', [params.destinationAddress, amountUnits])
  const tx = await signer.sendTransaction({
    to: tokenAddress,
    data,
    value: 0n,
    gasLimit: 120000n,
  })
  await tx.wait(1)
  return { txHash: tx.hash, tokenAmount: tokenAmountStr }
}

export { NATIVE_TOKEN_ADDRESS }
