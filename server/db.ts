import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient, ObjectId, type Filter } from 'mongodb'

export type InvoiceStatus = 'sent' | 'accepted' | 'rejected' | 'paid'

export interface InvoiceDoc {
  _id?: ObjectId | string
  invoiceId: string
  issuerAddress: string
  payerAddress: string
  issuerInfo?: {
    firstName?: string
    lastName?: string
    company?: string
  }
  payerInfo?: {
    firstName?: string
    lastName?: string
    company?: string
  }
  lineItems?: Array<{
    title: string
    description: string
    amount: number
    quantity?: number
    unitPrice?: number
  }>
  title: string
  description: string
  amount: number
  tokenAddress: string
  tokenSymbol: string
  currencySymbol: string
  status: InvoiceStatus
  rejectionReason: string | null
  pdfHash: string
  createdAt: string
  dueDate?: string
  updatedAt?: string
  payment?: {
    relayId?: string
    txHash?: string
    paidAt?: string
  }
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const MONGODB_DB = process.env.MONGODB_DB || 'nyx_finance'
const COLLECTION = 'contracts'
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true'
const REQUIRE_REMOTE_DB = IS_VERCEL || process.env.NODE_ENV === 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '.data')
const DATA_FILE = path.join(DATA_DIR, 'contracts.json')

let client: MongoClient | null = null
let useFileStore = false
let warnedFallback = false

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8')
}

function readAllFile(): InvoiceDoc[] {
  ensureFile()
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as InvoiceDoc[]
  } catch {
    return []
  }
}

function writeAllFile(data: InvoiceDoc[]) {
  ensureFile()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

async function getCollection() {
  if (REQUIRE_REMOTE_DB && !process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in production/serverless environments')
  }
  if (useFileStore) return null
  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 2500 })
      await client.connect()
    }
    return client.db(MONGODB_DB).collection<InvoiceDoc>(COLLECTION)
  } catch (err) {
    if (REQUIRE_REMOTE_DB) {
      throw err
    }
    useFileStore = true
    if (!warnedFallback) {
      warnedFallback = true
      console.warn('[db] Mongo unavailable, falling back to file store:', err)
    }
    return null
  }
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null
}

function idFilter(id: string): Filter<InvoiceDoc> {
  const byObjectId = toObjectId(id)
  if (byObjectId) {
    return {
      $or: [{ _id: byObjectId }, { _id: id }, { invoiceId: id }],
    }
  }
  return { $or: [{ _id: id }, { invoiceId: id }] }
}

function byIdOrInvoiceId(doc: InvoiceDoc, id: string): boolean {
  return String(doc._id) === id || doc.invoiceId === id
}

export function toPublicInvoice(doc: InvoiceDoc) {
  return {
    ...doc,
    _id: doc._id?.toString(),
  }
}

export const db = {
  async create(doc: InvoiceDoc): Promise<string> {
    const col = await getCollection()
    if (col) {
      const res = await col.insertOne(doc)
      return res.insertedId.toString()
    }

    const data = readAllFile()
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    data.push({ ...doc, _id: id })
    writeAllFile(data)
    return id
  },

  async listByAddress(address: string): Promise<InvoiceDoc[]> {
    const normalized = normalizeAddress(address)
    const col = await getCollection()
    if (col) {
      const all = await col
        .find({})
        .sort({ createdAt: -1 })
        .toArray()
      return all.filter((doc) =>
        normalizeAddress(doc.issuerAddress) === normalized ||
        normalizeAddress(doc.payerAddress) === normalized
      )
    }

    return readAllFile()
      .filter((doc) =>
        normalizeAddress(doc.issuerAddress) === normalized ||
        normalizeAddress(doc.payerAddress) === normalized
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  async getById(id: string): Promise<InvoiceDoc | null> {
    const col = await getCollection()
    if (col) return col.findOne(idFilter(id))

    const data = readAllFile()
    return data.find((doc) => byIdOrInvoiceId(doc, id)) ?? null
  },

  async patchById(id: string, patch: Partial<InvoiceDoc>): Promise<InvoiceDoc | null> {
    const col = await getCollection()
    const withUpdated = { ...patch, updatedAt: new Date().toISOString() }
    if (col) {
      await col.updateOne(idFilter(id), { $set: withUpdated })
      return col.findOne(idFilter(id))
    }

    const data = readAllFile()
    const idx = data.findIndex((doc) => byIdOrInvoiceId(doc, id))
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...withUpdated }
    writeAllFile(data)
    return data[idx]
  },
}
