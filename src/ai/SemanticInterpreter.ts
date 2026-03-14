import OpenAI from 'openai'
import type { SemanticMapping, ParameterName } from './types'

const SYSTEM_PROMPT = `You are a semantic audio mapping engine for a musical instrument called Infinite Knob.

Given a word or phrase, generate a mapping that transforms audio parameters as a knob turns from 0 (start) to 1 (end).

Available parameters and their ranges:
- lpf: Low-pass filter cutoff in Hz. Range: 80–18000. Lower = darker, murkier.
- gain: Overall volume. Range: 0.0–1.0.
- room: Reverb wetness. Range: 0.0–1.0. Higher = more spacious, distant.
- detune: Pitch shift in cents. Range: -1200–1200. 0 = center, ±1200 = one octave.
- distortion: Harmonic saturation. Range: 0.0–1.0. Higher = grittier, harsher.
- lfo_rate: Pitch modulation speed in Hz. Range: 0.1–8.0.
- lfo_depth: Pitch modulation depth in cents. Range: 0.0–100.0.

Rules:
1. Choose 2–4 parameters that best express the word's emotional or sonic quality.
2. The trajectory from start to end should feel like a continuous journey through that quality.
3. Make musically interesting choices — low start values don't always mean "neutral".
4. Handle any input including misspellings, metaphors, and abstract concepts.

Respond ONLY with valid JSON matching this schema exactly:
{
  "concept": string,
  "description": string (one evocative sentence describing the sonic journey, no technical terms),
  "soundMappings": [
    { "parameter": string, "startValue": number, "endValue": number }
  ]
}`

const VALID_PARAMS: Set<string> = new Set([
  'lpf', 'gain', 'room', 'detune', 'distortion', 'lfo_rate', 'lfo_depth',
])

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const key = import.meta.env.VITE_OPENAI_API_KEY
    client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true })
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
    temperature: 0.8,
    max_tokens: 400,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

  // Validate and sanitize
  const soundMappings = (parsed.soundMappings ?? [])
    .filter((m: { parameter: string }) => VALID_PARAMS.has(m.parameter))
    .map((m: { parameter: ParameterName; startValue: number; endValue: number }) => ({
      parameter: m.parameter,
      startValue: Number(m.startValue),
      endValue: Number(m.endValue),
    }))

  return {
    concept: String(parsed.concept ?? input),
    description: String(parsed.description ?? ''),
    soundMappings,
  }
}

// Deterministic fallback when AI is unavailable
export function fallbackMapping(input: string): SemanticMapping {
  const hash = input.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const presets: SemanticMapping[] = [
    {
      concept: input,
      description: 'warmth rising from shadow into golden light',
      soundMappings: [
        { parameter: 'lpf', startValue: 300, endValue: 5000 },
        { parameter: 'room', startValue: 0.05, endValue: 0.6 },
      ],
    },
    {
      concept: input,
      description: 'a brightness that dissolves into clarity',
      soundMappings: [
        { parameter: 'lpf', startValue: 1200, endValue: 16000 },
        { parameter: 'room', startValue: 0.3, endValue: 0.0 },
        { parameter: 'gain', startValue: 0.5, endValue: 0.85 },
      ],
    },
    {
      concept: input,
      description: 'something fragile unravelling into noise',
      soundMappings: [
        { parameter: 'distortion', startValue: 0.0, endValue: 0.75 },
        { parameter: 'lfo_rate', startValue: 0.3, endValue: 6.0 },
        { parameter: 'lfo_depth', startValue: 0, endValue: 80 },
      ],
    },
    {
      concept: input,
      description: 'depth sinking into silence and space',
      soundMappings: [
        { parameter: 'lpf', startValue: 3000, endValue: 200 },
        { parameter: 'room', startValue: 0.1, endValue: 0.95 },
        { parameter: 'gain', startValue: 0.8, endValue: 0.35 },
      ],
    },
  ]
  return presets[hash % presets.length]
}
