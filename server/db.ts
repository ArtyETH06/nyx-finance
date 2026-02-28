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

function idFilter(id: string): Filter<InvoiceDoc> {
  const byObjectId = toObjectId(id)
  if (byObjectId) {
    return {
      $or: [
        { _id: byObjectId },
        { _id: id },
        { invoiceId: id },
      ],
    }
  }
  return {
    $or: [
      { _id: id },
      { invoiceId: id },
    ],
  }
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
    const col = await getCollection()
    return col.findOne(idFilter(id))
  },

  async patchById(id: string, patch: Partial<InvoiceDoc>): Promise<InvoiceDoc | null> {
    const col = await getCollection()
    await col.updateOne(
      idFilter(id),
      { $set: { ...patch, updatedAt: new Date().toISOString() } }
    )
    return col.findOne(idFilter(id))
  },
}
