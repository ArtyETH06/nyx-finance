import { useState, useEffect } from 'react'
import { toast, type ToastMessage } from '../lib/toast'
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react'

export default function Toast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  useEffect(() => {
    return toast.subscribe(setMessages)
  }, [])

  if (!messages.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {messages.map((msg) => {
        const isSuccess = msg.type === 'success'
        const inner = (
          <>
            <div className="flex-shrink-0 mt-0.5">
              {isSuccess
                ? <CheckCircle2 size={15} strokeWidth={1.5} className="text-nyx-success" />
                : <XCircle size={15} strokeWidth={1.5} className="text-nyx-danger" />
              }
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-nyx-text text-sm leading-snug">{msg.text}</span>
              {msg.href && (
                <span className="flex items-center gap-1 text-[11px] text-nyx-accent font-medium">
                  <ExternalLink size={10} strokeWidth={2} />
                  View on explorer
                </span>
              )}
            </div>
          </>
        )

        const cls = [
          'flex items-start gap-3 px-4 py-3 rounded-xl text-sm shadow-xl',
          'bg-nyx-card border backdrop-blur-sm',
          'animate-in fade-in slide-in-from-bottom-2 duration-200',
          isSuccess ? 'border-nyx-success/30' : 'border-nyx-danger/30',
          msg.href ? 'cursor-pointer hover:brightness-110 transition-all duration-150' : 'pointer-events-none',
        ].join(' ')

        return msg.href ? (
          <a
            key={msg.id}
            href={msg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cls}
            style={{ minWidth: 260, maxWidth: 360 }}
          >
            {inner}
          </a>
        ) : (
          <div
            key={msg.id}
            className={cls}
            style={{ minWidth: 260, maxWidth: 360 }}
          >
            {inner}
          </div>
        )
      })}
    </div>
  )
}
