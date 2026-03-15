import type { SemanticMapping, CapabilityParam, LayerCategory, TrajectorySegment } from './types'

const VALID_PARAMS = new Set<CapabilityParam>([
  'gain', 'wave',
  'lpf', 'lpq', 'hpf',
  'shape', 'crush',
  'fm', 'lfo', 'detune',
  'sub', 'noise',
  'room', 'delay', 'pan',
])

const VALID_CATEGORIES = new Set<LayerCategory>([
  'STRUCTURE', 'TIMBRE', 'TEXTURE', 'MOTION', 'EMOTION', 'SPACE',
])

export async function interpret(input: string): Promise<SemanticMapping> {
  let parsed: any
  try {
    const res = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: input.trim() }),
    })
    if (!res.ok) throw new Error('bad status')
    parsed = await res.json()
  } catch {
    return fallbackMapping(input)
  }

  const trajectory: TrajectorySegment[] = (parsed.trajectory ?? [])
    .filter((s: { param: string }) => VALID_PARAMS.has(s.param as CapabilityParam))
    .map((s: {
      param: CapabilityParam
      range: [number, number]
      from: number
      to: number
      curve?: string
    }) => ({
      param: s.param,
      range: [Math.max(0, Number(s.range?.[0] ?? 0)), Math.min(1, Number(s.range?.[1] ?? 1))],
      from: Number(s.from),
      to: Number(s.to),
      curve: s.curve ?? 'linear',
    }))

  if (trajectory.length === 0) return fallbackMapping(input)

  const category = VALID_CATEGORIES.has(parsed.category)
    ? (parsed.category as LayerCategory)
    : 'TIMBRE'

  return {
    term: String(parsed.term ?? input),
    confidence: Number(parsed.confidence ?? 0.7),
    description: parsed.description ? String(parsed.description) : undefined,
    category,
    latent: parsed.latent ?? undefined,
    trajectory,
  }
}

export function fallbackMapping(input: string): SemanticMapping {
  const hash = input.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)

  const presets: SemanticMapping[] = [
    {
      term: input, confidence: 0.5, category: 'TIMBRE',
      description: 'the sound darkens and recedes into warmth',
      trajectory: [
        { range: [0.0, 0.5], param: 'lpf', from: 8000, to: 1800, curve: 'easeIn' },
        { range: [0.0, 0.4], param: 'shape', from: 0.4, to: 0, curve: 'linear' },
        { range: [0.3, 0.8], param: 'room', from: 0.05, to: 0.4, curve: 'easeOut' },
        { range: [0.7, 1.0], param: 'lpf', from: 1800, to: 600, curve: 'exp' },
      ],
    },
    {
      term: input, confidence: 0.5, category: 'TEXTURE',
      description: 'the sound degrades into digital grain',
      trajectory: [
        { range: [0.0, 0.4], param: 'noise', from: 0, to: 0.5, curve: 'easeIn' },
        { range: [0.0, 0.4], param: 'room', from: 0.5, to: 0.05, curve: 'easeOut' },
        { range: [0.3, 0.7], param: 'crush', from: 0, to: 0.7, curve: 'linear' },
        { range: [0.4, 1.0], param: 'lpf', from: 5000, to: 900, curve: 'exp' },
        { range: [0.6, 1.0], param: 'lfo', from: 0, to: 6, curve: 'easeIn' },
      ],
    },
    {
      term: input, confidence: 0.5, category: 'SPACE',
      description: 'the sound opens into vast empty distance',
      trajectory: [
        { range: [0.0, 0.5], param: 'room', from: 0.05, to: 0.9, curve: 'easeIn' },
        { range: [0.0, 0.4], param: 'noise', from: 0.4, to: 0, curve: 'linear' },
        { range: [0.2, 0.7], param: 'delay', from: 0, to: 0.5, curve: 'easeOut' },
        { range: [0.5, 1.0], param: 'lpf', from: 4000, to: 1200, curve: 'linear' },
      ],
    },
    {
      term: input, confidence: 0.5, category: 'MOTION',
      description: 'the sound begins to shiver and drift',
      trajectory: [
        { range: [0.0, 0.4], param: 'lfo', from: 0, to: 5, curve: 'easeIn' },
        { range: [0.0, 0.4], param: 'detune', from: 0, to: 40, curve: 'linear' },
        { range: [0.3, 0.8], param: 'delay', from: 0, to: 0.4, curve: 'easeOut' },
        { range: [0.0, 0.4], param: 'shape', from: 0.4, to: 0, curve: 'linear' },
        { range: [0.5, 1.0], param: 'room', from: 0.1, to: 0.5, curve: 'linear' },
      ],
    },
    {
      term: input, confidence: 0.5, category: 'EMOTION',
      description: 'the sound grows heavy with unresolved tension',
      trajectory: [
        { range: [0.0, 0.5], param: 'lpf', from: 6000, to: 1500, curve: 'easeIn' },
        { range: [0.0, 0.4], param: 'fm', from: 0, to: 0.25, curve: 'linear' },
        { range: [0.2, 0.7], param: 'lpq', from: 1, to: 8, curve: 'easeIn' },
        { range: [0.4, 1.0], param: 'room', from: 0.2, to: 0.6, curve: 'easeOut' },
        { range: [0.0, 0.4], param: 'detune', from: 30, to: 0, curve: 'linear' },
      ],
    },
  ]

  return presets[hash % presets.length]
}
