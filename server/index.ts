import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { contractsRouter } from './routes/contracts.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api', contractsRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`NYX API server running on http://localhost:${PORT}`)
})
