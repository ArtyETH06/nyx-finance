import { MongoClient, ObjectId } from 'mongodb'

export type InvoiceStatus = 'sent' | 'accepted' | 'rejected' | 'paid'

export interface InvoiceDoc {
  _id?: ObjectId
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
  title: string
  description: string
  amount: number
  currency: string
  status: InvoiceStatus
  rejectionReason: string | null
  pdfHash: string
  createdAt: string
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

let client: MongoClient | null = null

async function getCollection() {
  if (!client) {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
  }
  return client.db(MONGODB_DB).collection<InvoiceDoc>(COLLECTION)
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null
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
    const res = await col.insertOne(doc)
    return res.insertedId.toString()
  },

  async listByAddress(address: string): Promise<InvoiceDoc[]> {
    const col = await getCollection()
    return col
      .find({
        $or: [
          { issuerAddress: address },
          { payerAddress: address },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray()
  },

  async getById(id: string): Promise<InvoiceDoc | null> {
    const oid = toObjectId(id)
    if (!oid) return null
    const col = await getCollection()
    return col.findOne({ _id: oid })
  },

  async patchById(id: string, patch: Partial<InvoiceDoc>): Promise<InvoiceDoc | null> {
    const oid = toObjectId(id)
    if (!oid) return null
    const col = await getCollection()
    await col.updateOne(
      { _id: oid },
      { $set: { ...patch, updatedAt: new Date().toISOString() } }
    )
    return col.findOne({ _id: oid })
  },
}
