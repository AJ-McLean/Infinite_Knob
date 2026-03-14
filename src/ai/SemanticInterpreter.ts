import OpenAI from 'openai'
import type { SemanticMapping, CapabilityParam } from './types'

const SYSTEM_PROMPT = `You are the semantic mapping engine for Infinite Knob, a musical instrument.

Given a word or phrase, return a JSON mapping that morphs audio as a knob moves from 0 (start) to 1 (end).

Available parameters:
- lpf: low-pass filter cutoff Hz. Range: 80–12000. Use to control brightness/darkness.
- lpq: filter resonance. Range: 0–10. Higher = more resonant peak at cutoff.
- gain: volume. Range: 0.0–2.0.
- shape: waveshaper distortion (0 = clean, 1 = fully saturated). Range: 0.0–1.0.
- delay: echo/delay mix. Range: 0.0–0.8.
- room: reverb wetness. Range: 0.0–1.0.
- fm: FM synthesis index (0 = pure tone, 20 = heavy metallic FM). Range: 0.0–20.0.
- lfo: tremolo rate in Hz. Range: 0.0–12.0.

Rules:
1. Choose 2–4 parameters that evoke the word's quality.
2. The journey from start (0) to end (1) should feel like a continuous transformation through that quality.
3. Interesting from/to ranges are key — don't default to 0 → max.
4. Any input is valid — misspellings, metaphors, abstract concepts.
5. confidence reflects how confidently the mapping expresses the concept (0.0–1.0).

Return ONLY valid JSON matching this schema exactly:
{
  "term": string,
  "confidence": number,
  "description": string (one evocative sentence, no technical terms),
  "mappings": [
    { "param": string, "from": number, "to": number }
  ]
}`

const VALID_PARAMS = new Set<CapabilityParam>([
  'lpf', 'lpq', 'gain', 'shape', 'delay', 'room', 'fm', 'lfo',
])

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    })
  }
  return client
}

export async function interpret(input: string): Promise<SemanticMapping> {
  const openai = getClient()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input.trim() },
    ],
    temperature: 0.75,
    max_tokens: 400,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

  const mappings = (parsed.mappings ?? [])
    .filter((m: { param: string }) => VALID_PARAMS.has(m.param as CapabilityParam))
    .map((m: { param: CapabilityParam; from: number; to: number }) => ({
      param: m.param,
      from: Number(m.from),
      to: Number(m.to),
    }))

  return {
    term: String(parsed.term ?? input),
    confidence: Number(parsed.confidence ?? 0.7),
    description: parsed.description ? String(parsed.description) : undefined,
    mappings,
  }
}

export function fallbackMapping(input: string): SemanticMapping {
  const hash = input.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)

  const presets: SemanticMapping[] = [
    {
      term: input, confidence: 0.7,
      description: 'warmth rising from shadow into light',
      mappings: [
        { param: 'lpf', from: 400, to: 6000 },
        { param: 'room', from: 0.05, to: 0.55 },
      ],
    },
    {
      term: input, confidence: 0.7,
      description: 'bright clarity dissolving into space',
      mappings: [
        { param: 'lpf', from: 800, to: 10000 },
        { param: 'gain', from: 0.4, to: 0.9 },
        { param: 'room', from: 0.4, to: 0.0 },
      ],
    },
    {
      term: input, confidence: 0.7,
      description: 'something fragile unravelling into noise',
      mappings: [
        { param: 'shape', from: 0.0, to: 0.8 },
        { param: 'lfo', from: 0.2, to: 8.0 },
        { param: 'lpf', from: 4000, to: 800 },
      ],
    },
    {
      term: input, confidence: 0.7,
      description: 'sinking deeper into silence and echo',
      mappings: [
        { param: 'lpf', from: 5000, to: 200 },
        { param: 'room', from: 0.1, to: 0.95 },
        { param: 'gain', from: 0.8, to: 0.3 },
      ],
    },
    {
      term: input, confidence: 0.7,
      description: 'a metallic shimmer becoming electric',
      mappings: [
        { param: 'fm', from: 0, to: 14 },
        { param: 'lpf', from: 6000, to: 3000 },
        { param: 'delay', from: 0, to: 0.4 },
      ],
    },
  ]

  return presets[hash % presets.length]
}
