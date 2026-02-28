export type ToastType = 'success' | 'error'

export interface ToastMessage {
  id: number
  text: string
  type: ToastType
  href?: string
}

type Listener = (msgs: ToastMessage[]) => void

let messages: ToastMessage[] = []
const listeners: Set<Listener> = new Set()
let nextId = 0

function notify() {
  const snapshot = [...messages]
  listeners.forEach((l) => l(snapshot))
}

export const toast = {
  show(text: string, type: ToastType = 'success', href?: string, duration = 5000) {
    const id = ++nextId
    messages = [...messages, { id, text, type, href }]
    notify()
    setTimeout(() => {
      messages = messages.filter((m) => m.id !== id)
      notify()
    }, duration)
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    fn([...messages])
    return () => { listeners.delete(fn) }
  },
}
