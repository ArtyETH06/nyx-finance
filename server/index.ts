import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { contractsRouter } from './routes/contracts.js'
import { paychecksRouter } from './routes/paychecks.js'
import { scheduledPaymentsRouter } from './routes/scheduledPayments.js'
import { emailRouter } from './routes/email.js'

// Load both .env and .env.local for local development.
dotenv.config()
dotenv.config({ path: '.env.local', override: true })

const app = express()

function isAllowedOrigin(origin: string): boolean {
  return (
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    /^https:\/\/nyx-finance\.vercel\.app$/.test(origin) ||
    /^https:\/\/.*-arty-industries\.vercel\.app$/.test(origin) ||
    /^https:\/\/.*\.vercel\.app$/.test(origin)
  )
}

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (typeof origin === 'string' && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  next()
})

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('Origin not allowed by CORS'))
  },
}))
app.use(express.json())

app.use('/api', contractsRouter)
app.use('/api', paychecksRouter)
app.use('/api', scheduledPaymentsRouter)
app.use('/api', emailRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT ?? 3002
app.listen(PORT, () => {
  console.log(`NYX API server running on http://localhost:${PORT}`)
})
