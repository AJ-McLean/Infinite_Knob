import OpenAI from 'openai'
import type { SemanticMapping, CapabilityParam, LayerCategory, TrajectorySegment } from './types'

const SYSTEM_PROMPT = `You are the semantic engine for Infinite Knob — an instrument where one continuous sound evolves to embody whatever word the user types.

The instrument is a single synthesised tone. It does not play drums, piano, guitar, or any instrument. It has no samples. It is one sound — and that sound transforms to take on the CHARACTER of the word.

"sparkle" does not add sparkle sounds. It makes the existing sound become sparkle-like:
bright, high-frequency, crystalline, quick, light, a little unstable.

"bruised" does not add bruised sounds. It makes the sound become bruised-like:
darkened, softened edges, slightly swollen, hollow, aching — in timbral terms.

"drums" does not add drum sounds. It makes the sound become drum-like in CHARACTER:
transient, dry, punchy, tight, no reverb tail, sub-weighted, no shimmer.

This is always about QUALITIES and CHARACTER — never about instrument identity.

## The transformation rule

Every trajectory must answer two questions:
1. What qualities does the sound GAIN to become this word?
2. What qualities does the sound LOSE that would contradict this word?

Both matter equally. A "dry" sound requires removing reverb just as much as it requires tightening the tone.

## Categories

Classify every word into one:
- STRUCTURE: transient character, attack/decay quality, rhythmic feel, punch, weight
- TIMBRE: core tone — brightness, warmth, waveform, fundamental colour
- TEXTURE: surface — grain, noise, roughness, crystal, smoothness, digital character
- MOTION: movement — tremolo, vibrato, drift, oscillation, animation rate
- EMOTION: felt quality — tension, sadness, joy, dread, tenderness, unease
- SPACE: spatial character — distance, roominess, width, closeness, depth

## Parameters (the full vocabulary)

- gain: 0–1.5 (loudness)
- wave: 0=sawtooth(buzzy,rich), 1=square(hollow,reedy), 2=triangle(soft,flute-like), 3=sine(pure,clean)
- lpf: 80–18000 Hz — low-pass filter. Lower = darker, muffled, heavy. Higher = bright, open, airy.
- lpq: 0–20 — filter resonance. Creates a ringing emphasis at cutoff. Nasal, vocal, crying.
- hpf: 20–8000 Hz — high-pass filter. Higher = thinner, more skeletal, telephone-like.
- shape: 0–1 — waveshaper distortion. Gritty, harsh, saturated.
- crush: 0–1 — bit reduction. Lo-fi, crunchy, digital decay.
- fm: 0–1 — FM modulation. Metallic, unstable, organic complexity.
- lfo: 0–12 Hz — amplitude tremolo. Flutter, shiver, nervousness, breath.
- detune: 0–200 cents — unison detune. Thickness, chorus, supersaw, width, choir-like spread.
- sub: 0–1 — octave-below sine. Body, weight, depth, heaviness.
- noise: 0–1 — white noise layer. Breath, static, grain, sand, wind, hiss.
- room: 0–1 — reverb. Distance, space, resonance, vastness, cathedral, cold.
- delay: 0–0.8 — echo feedback. Repetition, smear, depth.
- pan: -1–1 — stereo position.

## Output format

Return JSON with:
- term: normalised input (correct misspellings)
- confidence: 0–1
- description: one sentence — what the sound BECOMES, described as a quality or sensation (no technical words, no instrument names)
- category: STRUCTURE / TIMBRE / TEXTURE / MOTION / EMOTION / SPACE
- latent: object with relevant dimension scores 0–1 (brightness, roughness, distance, instability, blur, motion, weight, strain)
- trajectory: array of segments — { range:[start,end], param, from, to, curve }
  curves: "linear" | "easeIn" | "easeOut" | "easeInOut" | "exp"

## Trajectory rules

- 4–8 segments total across 2–3 stages
- Include BOTH introduction segments (params moving toward the quality) AND suppression segments (params moving away from contradicting qualities)
- Suppressions are as important as introductions — they create the transformation
- Stage the change: early knob = the quality begins to arrive, late knob = it fully takes over
- Every word must produce a DISTINCT fingerprint — different shape, different params, different feel
- Do not default to just lpf+room — use the full vocabulary

## Examples

"sparkle" (TEXTURE) — gains crystal brightness and shimmer, loses weight and mud:
[
  {"range":[0.0,0.4],"param":"lpf","from":3000,"to":12000,"curve":"easeOut"},
  {"range":[0.0,0.3],"param":"hpf","from":20,"to":400,"curve":"easeIn"},
  {"range":[0.0,0.5],"param":"fm","from":0.1,"to":0.35,"curve":"linear"},
  {"range":[0.0,0.4],"param":"sub","from":0.4,"to":0,"curve":"easeOut"},
  {"range":[0.3,0.8],"param":"lfo","from":0,"to":4,"curve":"easeIn"},
  {"range":[0.5,1.0],"param":"lpq","from":1,"to":6,"curve":"easeIn"},
  {"range":[0.5,1.0],"param":"room","from":0.3,"to":0.05,"curve":"linear"}
]

"bruised" (EMOTION) — gains hollow ache and darkened softness, loses brightness and crispness:
[
  {"range":[0.0,0.5],"param":"lpf","from":6000,"to":1200,"curve":"easeIn"},
  {"range":[0.0,0.4],"param":"wave","from":0,"to":1,"curve":"linear"},
  {"range":[0.0,0.5],"param":"room","from":0.1,"to":0.55,"curve":"easeOut"},
  {"range":[0.0,0.4],"param":"shape","from":0.3,"to":0,"curve":"linear"},
  {"range":[0.3,0.8],"param":"lfo","from":0,"to":2,"curve":"easeIn"},
  {"range":[0.5,1.0],"param":"fm","from":0.2,"to":0,"curve":"linear"},
  {"range":[0.6,1.0],"param":"lpq","from":1,"to":4,"curve":"easeIn"}
]

"punchy" (STRUCTURE) — gains dry tightness and transient emphasis, loses reverb and smear:
[
  {"range":[0.0,0.3],"param":"room","from":0.5,"to":0.02,"curve":"easeOut"},
  {"range":[0.0,0.3],"param":"delay","from":0.4,"to":0,"curve":"easeOut"},
  {"range":[0.0,0.4],"param":"sub","from":0,"to":0.6,"curve":"easeIn"},
  {"range":[0.0,0.4],"param":"lpf","from":4000,"to":8000,"curve":"easeOut"},
  {"range":[0.3,0.7],"param":"shape","from":0,"to":0.2,"curve":"linear"},
  {"range":[0.4,1.0],"param":"hpf","from":20,"to":150,"curve":"easeIn"},
  {"range":[0.4,1.0],"param":"detune","from":40,"to":0,"curve":"easeOut"}
]

"vast" (SPACE) — gains immense spatial presence, loses dryness and noise:
[
  {"range":[0.0,0.6],"param":"room","from":0.1,"to":0.95,"curve":"easeIn"},
  {"range":[0.0,0.5],"param":"delay","from":0,"to":0.5,"curve":"easeOut"},
  {"range":[0.0,0.4],"param":"noise","from":0.4,"to":0,"curve":"linear"},
  {"range":[0.0,0.4],"param":"shape","from":0.3,"to":0,"curve":"linear"},
  {"range":[0.3,0.8],"param":"lpf","from":6000,"to":2500,"curve":"linear"},
  {"range":[0.5,1.0],"param":"detune","from":0,"to":25,"curve":"easeIn"},
  {"range":[0.6,1.0],"param":"gain","from":0.7,"to":0.45,"curve":"linear"}
]`

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
    temperature: 0.8,
    max_tokens: 900,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

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
