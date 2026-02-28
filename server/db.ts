import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient, ObjectId, type Filter } from 'mongodb'

export type InvoiceStatus = 'sent' | 'accepted' | 'rejected' | 'paid'
export type OrgMemberRole = 'admin' | 'member'

export type SalarySchedule = 'weekly' | 'biweekly' | 'monthly'

export interface OrgMember {
  address: string
  role: OrgMemberRole
  firstName?: string
  lastName?: string
  companyRole?: string
  salary?: number
  salaryCurrency?: string
  salarySchedule?: SalarySchedule
  joinedAt: string
}

export interface OrganizationDoc {
  _id?: ObjectId | string
  name: string
  ownerAddress: string
  members: OrgMember[]
  createdAt: string
}

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

export type PaycheckStatus = 'pending' | 'confirmed' | 'failed'
export type ScheduledPaymentStatus = 'scheduled' | 'executed' | 'cancelled'

export interface PaycheckDoc {
  _id?: ObjectId | string
  payrollId: string
  organizationId: string
  organizationName: string
  memberAddress: string
  memberName?: string
  amount: number
  currency: string
  schedule: SalarySchedule
  executedAt: string
  txHash?: string
  relayId?: string
  status: PaycheckStatus
  pdfHash: string
  createdAt: string
}

export interface ScheduledPaymentDoc {
  _id?: ObjectId | string
  organizationId: string
  organizationName: string
  memberAddress: string
  memberName?: string
  amount: number
  currency: string
  schedule: SalarySchedule
  scheduledFor: string
  status: ScheduledPaymentStatus
  createdAt: string
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const MONGODB_DB = process.env.MONGODB_DB || 'nyx_finance'
const COLLECTION = 'contracts'
const ORG_COLLECTION = 'organizations'
const PAYCHECK_COLLECTION = 'paychecks'
const SCHEDULED_COLLECTION = 'scheduled_payments'
const VERCEL_ENV = process.env.VERCEL_ENV // 'production' | 'preview' | 'development' | undefined
// If MONGODB_URI is explicitly provided, always require it — never silently fall back to file store
const HAS_REMOTE_URI = !!process.env.MONGODB_URI
const REQUIRE_REMOTE_DB = HAS_REMOTE_URI || VERCEL_ENV === 'production' || VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'production'
// Use a short timeout for local-only dev (no URI set), longer for real remote connections
const SERVER_SELECTION_TIMEOUT = HAS_REMOTE_URI ? 10000 : 300

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '.data')
const DATA_FILE = path.join(DATA_DIR, 'contracts.json')
const ORG_DATA_FILE = path.join(DATA_DIR, 'organizations.json')
const PAYCHECK_DATA_FILE = path.join(DATA_DIR, 'paychecks.json')
const SCHEDULED_DATA_FILE = path.join(DATA_DIR, 'scheduled_payments.json')

// Store on globalThis so the connection survives module re-evaluations
// (vercel dev re-imports modules on each request; globalThis persists within the process)
const g = globalThis as typeof globalThis & {
  _nyxMongoPromise?: Promise<MongoClient | null>
}
let useFileStore = false

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

function ensureOrgFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(ORG_DATA_FILE)) fs.writeFileSync(ORG_DATA_FILE, '[]', 'utf-8')
}

function readAllOrgFile(): OrganizationDoc[] {
  ensureOrgFile()
  try {
    return JSON.parse(fs.readFileSync(ORG_DATA_FILE, 'utf-8')) as OrganizationDoc[]
  } catch {
    return []
  }
}

function writeAllOrgFile(data: OrganizationDoc[]) {
  ensureOrgFile()
  fs.writeFileSync(ORG_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function ensurePaycheckFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(PAYCHECK_DATA_FILE)) fs.writeFileSync(PAYCHECK_DATA_FILE, '[]', 'utf-8')
}
function readAllPaycheckFile(): PaycheckDoc[] {
  ensurePaycheckFile()
  try { return JSON.parse(fs.readFileSync(PAYCHECK_DATA_FILE, 'utf-8')) as PaycheckDoc[] } catch { return [] }
}
function writeAllPaycheckFile(data: PaycheckDoc[]) {
  ensurePaycheckFile()
  fs.writeFileSync(PAYCHECK_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function ensureScheduledFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(SCHEDULED_DATA_FILE)) fs.writeFileSync(SCHEDULED_DATA_FILE, '[]', 'utf-8')
}
function readAllScheduledFile(): ScheduledPaymentDoc[] {
  ensureScheduledFile()
  try { return JSON.parse(fs.readFileSync(SCHEDULED_DATA_FILE, 'utf-8')) as ScheduledPaymentDoc[] } catch { return [] }
}
function writeAllScheduledFile(data: ScheduledPaymentDoc[]) {
  ensureScheduledFile()
  fs.writeFileSync(SCHEDULED_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function getClient(): Promise<MongoClient | null> {
  if (useFileStore) return Promise.resolve(null)
  if (!g._nyxMongoPromise) {
    const mongo = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT,
      maxIdleTimeMS: 120_000,
      socketTimeoutMS: 30_000,
    })
    g._nyxMongoPromise = mongo.connect().then(
      () => {
        console.log('[db] MongoDB connected')
        return mongo as MongoClient | null
      },
      (err) => {
        g._nyxMongoPromise = undefined
        if (REQUIRE_REMOTE_DB) throw err
        useFileStore = true
        console.warn('[db] Mongo unavailable, falling back to file store:', (err as Error).message)
        return null
      },
    )
  }
  return g._nyxMongoPromise
}

async function getCollection() {
  const mongo = await getClient()
  return mongo ? mongo.db(MONGODB_DB).collection<InvoiceDoc>(COLLECTION) : null
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

async function getOrgCollection() {
  const mongo = await getClient()
  return mongo ? mongo.db(MONGODB_DB).collection<OrganizationDoc>(ORG_COLLECTION) : null
}

function orgIdFilter(id: string): Filter<OrganizationDoc> {
  const byObjectId = toObjectId(id)
  if (byObjectId) return { $or: [{ _id: byObjectId }, { _id: id as any }] }
  return { _id: id as any }
}

function byOrgId(doc: OrganizationDoc, id: string): boolean {
  return String(doc._id) === id
}

export function toPublicOrg(doc: OrganizationDoc) {
  return { ...doc, _id: doc._id?.toString() }
}

export const orgDb = {
  async create(doc: OrganizationDoc): Promise<string> {
    const col = await getOrgCollection()
    if (col) {
      const res = await col.insertOne(doc)
      return res.insertedId.toString()
    }
    const data = readAllOrgFile()
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    data.push({ ...doc, _id: id })
    writeAllOrgFile(data)
    return id
  },

  async listByOwner(ownerAddress: string): Promise<OrganizationDoc[]> {
    const normalized = normalizeAddress(ownerAddress)
    const col = await getOrgCollection()
    if (col) {
      return col
        .find({})
        .sort({ createdAt: -1 })
        .toArray()
        .then((all) => all.filter((d) => normalizeAddress(d.ownerAddress) === normalized))
    }
    return readAllOrgFile()
      .filter((d) => normalizeAddress(d.ownerAddress) === normalized)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  async getById(id: string): Promise<OrganizationDoc | null> {
    const col = await getOrgCollection()
    if (col) return col.findOne(orgIdFilter(id))
    const data = readAllOrgFile()
    return data.find((d) => byOrgId(d, id)) ?? null
  },

  async addMember(id: string, member: OrgMember): Promise<OrganizationDoc | null> {
    const col = await getOrgCollection()
    if (col) {
      await col.updateOne(orgIdFilter(id), { $push: { members: member } })
      return col.findOne(orgIdFilter(id))
    }
    const data = readAllOrgFile()
    const idx = data.findIndex((d) => byOrgId(d, id))
    if (idx === -1) return null
    data[idx] = { ...data[idx], members: [...data[idx].members, member] }
    writeAllOrgFile(data)
    return data[idx]
  },

  async updateMember(
    id: string,
    memberAddress: string,
    patch: Partial<Pick<OrgMember, 'salary' | 'salaryCurrency' | 'salarySchedule' | 'firstName' | 'lastName' | 'companyRole' | 'role'>>,
  ): Promise<OrganizationDoc | null> {
    const col = await getOrgCollection()
    if (col) {
      // Find org first to get concrete _id for positional operator
      const org = await col.findOne(orgIdFilter(id))
      if (!org) return null
      const fields: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) fields[`members.$.${k}`] = v
      }
      if (Object.keys(fields).length > 0) {
        await col.updateOne(
          { _id: org._id, 'members.address': memberAddress },
          { $set: fields },
        )
      }
      return col.findOne({ _id: org._id })
    }
    const data = readAllOrgFile()
    const orgIdx = data.findIndex((d) => byOrgId(d, id))
    if (orgIdx === -1) return null
    const mIdx = data[orgIdx].members.findIndex((m) => m.address === memberAddress)
    if (mIdx === -1) return null
    data[orgIdx].members[mIdx] = { ...data[orgIdx].members[mIdx], ...patch }
    writeAllOrgFile(data)
    return data[orgIdx]
  },
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

// ─── Paycheck DB ──────────────────────────────────────────────────────────────

async function getPaycheckCollection() {
  const mongo = await getClient()
  return mongo ? mongo.db(MONGODB_DB).collection<PaycheckDoc>(PAYCHECK_COLLECTION) : null
}

export function toPublicPaycheck(doc: PaycheckDoc) {
  return { ...doc, _id: doc._id?.toString() }
}

export const paycheckDb = {
  async create(doc: PaycheckDoc): Promise<string> {
    const col = await getPaycheckCollection()
    if (col) { const r = await col.insertOne(doc); return r.insertedId.toString() }
    const data = readAllPaycheckFile()
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    data.push({ ...doc, _id: id })
    writeAllPaycheckFile(data)
    return id
  },

  async listByMember(organizationId: string, memberAddress: string): Promise<PaycheckDoc[]> {
    const addr = normalizeAddress(memberAddress)
    const col = await getPaycheckCollection()
    if (col) {
      return col.find({ organizationId, memberAddress: { $regex: new RegExp(`^${addr}$`, 'i') } })
        .sort({ executedAt: -1 }).toArray()
    }
    return readAllPaycheckFile()
      .filter((d) => d.organizationId === organizationId && normalizeAddress(d.memberAddress) === addr)
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
  },

  async patchById(id: string, patch: Partial<PaycheckDoc>): Promise<PaycheckDoc | null> {
    const byObjectId = ObjectId.isValid(id) ? new ObjectId(id) : null
    const filter = byObjectId ? { $or: [{ _id: byObjectId }, { _id: id as any }] } : { _id: id as any }
    const col = await getPaycheckCollection()
    if (col) { await col.updateOne(filter as any, { $set: patch }); return col.findOne(filter as any) }
    const data = readAllPaycheckFile()
    const idx = data.findIndex((d) => String(d._id) === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...patch }
    writeAllPaycheckFile(data)
    return data[idx]
  },
}

// ─── Scheduled Payment DB ─────────────────────────────────────────────────────

async function getScheduledCollection() {
  const mongo = await getClient()
  return mongo ? mongo.db(MONGODB_DB).collection<ScheduledPaymentDoc>(SCHEDULED_COLLECTION) : null
}

export function toPublicScheduled(doc: ScheduledPaymentDoc) {
  return { ...doc, _id: doc._id?.toString() }
}

export const scheduledPaymentDb = {
  async create(doc: ScheduledPaymentDoc): Promise<string> {
    const col = await getScheduledCollection()
    if (col) { const r = await col.insertOne(doc); return r.insertedId.toString() }
    const data = readAllScheduledFile()
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    data.push({ ...doc, _id: id })
    writeAllScheduledFile(data)
    return id
  },

  async listByMember(organizationId: string, memberAddress: string): Promise<ScheduledPaymentDoc[]> {
    const addr = normalizeAddress(memberAddress)
    const col = await getScheduledCollection()
    if (col) {
      return col.find({ organizationId, memberAddress: { $regex: new RegExp(`^${addr}$`, 'i') } })
        .sort({ scheduledFor: 1 }).toArray()
    }
    return readAllScheduledFile()
      .filter((d) => d.organizationId === organizationId && normalizeAddress(d.memberAddress) === addr)
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
  },
}
