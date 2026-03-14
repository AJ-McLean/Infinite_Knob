export interface LogEntry {
  timestamp: string
  term: string
  confidence: number
  latent?: Record<string, number>
  aiTrajectory: { range: [number, number]; param: string; from: number; to: number; curve?: string }[]
  committedPosition: number
  effectiveParams: Record<string, number>
  layerStack: { token: string; category: string; weight: number; polarity: number; age: number }[]
}

const STORAGE_KEY = 'ik_usage_log'

function readLocal(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const UsageLogger = {
  commit(entry: LogEntry): void {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {
      const log = readLocal()
      log.push(entry)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(log)) } catch { /* full */ }
    })
    ;(window as unknown as Record<string, unknown>).__ik_log = readLocal()
  },

  all(): LogEntry[] {
    return readLocal()
  },

  download(): void {
    const blob = new Blob([JSON.stringify(readLocal(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `ik_log_${Date.now()}.json`,
    })
    a.click()
    URL.revokeObjectURL(url)
  },
}

;(window as unknown as Record<string, unknown>).__ik_download_log = UsageLogger.download.bind(UsageLogger)
