import OpenAI from 'openai'
import { SYSTEM_PROMPT } from '../server/prompt.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).end(); return }

  const input = String(req.body?.input ?? '').trim()
  if (!input) { res.status(400).json({ error: 'missing input' }); return }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'missing OPENAI_API_KEY' }); return }

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0.8,
      max_tokens: 900,
    })
    const raw = response.choices[0]?.message?.content ?? '{}'
    res.json(JSON.parse(raw))
  } catch (err) {
    console.error('interpret failed:', err)
    res.status(500).json({ error: 'interpret failed' })
  }
}
