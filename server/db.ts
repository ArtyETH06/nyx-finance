/**
 * Zero-config JSON file store — no MongoDB required.
 * Data is persisted to .data/contracts.json next to the server directory.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR  = path.join(__dirname, '..', '.data')
const DATA_FILE = path.join(DATA_DIR, 'contracts.json')

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8')
}

function readAll(): Record<string, unknown>[] {
  ensureFile()
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeAll(data: Record<string, unknown>[]) {
  ensureFile()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

let seq = 0

export const db = {
  insert(doc: Record<string, unknown>): string {
    const data = readAll()
    const id   = `${Date.now()}-${++seq}`
    data.push({ ...doc, _id: id })
    writeAll(data)
    return id
  },

  query(predicate: (doc: Record<string, unknown>) => boolean): Record<string, unknown>[] {
    return readAll()
      .filter(predicate)
      .sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string).getTime()
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string).getTime()
        return tb - ta
      })
  },
}
