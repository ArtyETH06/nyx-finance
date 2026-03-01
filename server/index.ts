import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { contractsRouter } from './routes/contracts.js'
import { paychecksRouter } from './routes/paychecks.js'
import { scheduledPaymentsRouter } from './routes/scheduledPayments.js'
import { emailRouter } from './routes/email.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api', contractsRouter)
app.use('/api', paychecksRouter)
app.use('/api', scheduledPaymentsRouter)
app.use('/api', emailRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`NYX API server running on http://localhost:${PORT}`)
})
