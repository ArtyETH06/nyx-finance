const LOCAL_PROXY_PREFIX = '/__nyx_api'

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function isLocalBrowserDev(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

export function getApiBaseUrl(): string {
  if (isLocalBrowserDev()) return LOCAL_PROXY_PREFIX

  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {}
  const configured = env.VITE_API_BASE_URL?.trim()
  if (configured) return trimTrailingSlash(configured)

  return ''
}

function rewriteLocalProxyPath(path: string): string {
  if (path === '/api') return ''
  if (path.startsWith('/api/')) return path.slice('/api'.length)
  return path
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = getApiBaseUrl()
  if (!base) return normalizedPath

  if (base === LOCAL_PROXY_PREFIX) {
    return `${base}${rewriteLocalProxyPath(normalizedPath)}`
  }

  return `${base}${normalizedPath}`
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init)
}
