import express from 'express'
import { insertEntry, allEntries } from './db.js'

const app = express()
app.use(express.json())

app.post('/api/log', (req, res) => {
  try {
    insertEntry(req.body)
    res.status(204).end()
  } catch (err) {
    console.error('log insert failed:', err)
    res.status(500).json({ error: 'insert failed' })
  }
})

app.get('/api/log', (_req, res) => {
  res.json(allEntries())
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`ik log server → http://localhost:${PORT}`)
})
