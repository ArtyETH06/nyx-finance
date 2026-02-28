/// <reference types="vite/client" />

interface EthereumProvider {
  request(args: { method: 'eth_requestAccounts' }): Promise<string[]>
  request(args: { method: 'eth_chainId' }): Promise<string>
  request(args: { method: 'eth_sendTransaction'; params: object[] }): Promise<string>
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, handler: (...args: unknown[]) => void): void
  removeListener(event: string, handler: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}
