import { useState, useEffect } from 'react'
import { toast, type ToastMessage } from '../lib/toast'
import { CheckCircle2, XCircle } from 'lucide-react'

export default function Toast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    return toast.subscribe(setMessages)
  }, [])

  if (!messages.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={[
            'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-xl',
            'bg-nyx-card border backdrop-blur-sm',
            'animate-in fade-in slide-in-from-bottom-2 duration-200',
            msg.type === 'success'
              ? 'border-nyx-success/30 text-nyx-success'
              : 'border-nyx-danger/30 text-nyx-danger',
          ].join(' ')}
          style={{ minWidth: 260 }}
        >
          {msg.type === 'success'
            ? <CheckCircle2 size={15} strokeWidth={1.5} />
            : <XCircle size={15} strokeWidth={1.5} />
          }
          <span className="text-nyx-text">{msg.text}</span>
        </div>
      ))}
    </div>
  )
}
