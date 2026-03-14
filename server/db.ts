import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'ik.db')

// Ensure the data directory exists
import fs from 'fs'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS usage_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               TEXT    NOT NULL,
    term             TEXT    NOT NULL,
    confidence       REAL    NOT NULL,
    latent           TEXT,
    ai_trajectory    TEXT    NOT NULL,
    committed_pos    REAL    NOT NULL,
    effective_params TEXT    NOT NULL
  )
`)

export interface LogRow {
  id: number
  ts: string
  term: string
  confidence: number
  latent: string | null
  ai_trajectory: string
  committed_pos: number
  effective_params: string
}

const insert = db.prepare(`
  INSERT INTO usage_log (ts, term, confidence, latent, ai_trajectory, committed_pos, effective_params)
  VALUES (@ts, @term, @confidence, @latent, @ai_trajectory, @committed_pos, @effective_params)
`)

const selectAll = db.prepare(`SELECT * FROM usage_log ORDER BY ts DESC`)

export function insertEntry(entry: {
  timestamp: string
  term: string
  confidence: number
  latent?: Record<string, number>
  aiTrajectory: unknown
  committedPosition: number
  effectiveParams: Record<string, number>
}): void {
  insert.run({
    ts: entry.timestamp,
    term: entry.term,
    confidence: entry.confidence,
    latent: entry.latent ? JSON.stringify(entry.latent) : null,
    ai_trajectory: JSON.stringify(entry.aiTrajectory),
    committed_pos: entry.committedPosition,
    effective_params: JSON.stringify(entry.effectiveParams),
  })
}

export function allEntries(): LogRow[] {
  return selectAll.all() as LogRow[]
}
