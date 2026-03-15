import express from 'express'
import OpenAI from 'openai'
import { insertEntry, allEntries } from './db.js'
import { SYSTEM_PROMPT } from './prompt.js'

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

app.post('/api/interpret', async (req, res) => {
  const input = String(req.body?.input ?? '').trim()
  if (!input) return res.status(400).json({ error: 'missing input' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'missing OPENAI_API_KEY' })

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: 'gpt-5-nano',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0.8,
      max_tokens: 900,
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)
    res.json(parsed)
  } catch (err) {
    console.error('interpret failed:', err)
    res.status(500).json({ error: 'interpret failed' })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`ik log server → http://localhost:${PORT}`)
})
