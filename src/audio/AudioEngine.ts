/**
 * Audio engine — Web Audio API for <5 ms parameter latency.
 *
 * State model:
 *   baseParams   — committed sound state (what the sound IS at knob=0)
 *   layers[]     — active semantic transformations, evaluated together against knob
 *
 * At each knob position k, for each active layer:
 *   effectiveWeight = layer.weight × layer.polarity × ageFactor(layer.age)
 *   delta[param]    = (evalTrajectory(layer, k)[param] − baseParams[param]) × effectiveWeight
 *
 * output[param] = baseParams[param] + Σ delta[param]
 *
 * Polarity cycle (same word typed repeatedly):
 *   0.6 → 1.0 → 0.6 → 0 → -0.6 → -1.0 → -0.6 → 0 → (repeat)
 *
 * Age-based forgetting (per word submitted since last interaction):
 *   age 0–2: full weight (×1.0)
 *   age 3:   ×0.75
 *   age 4:   ×0.4
 *   age 5:   ×0.1
 *   age 6+:  removed
 *
 * Signal chain:
 *   oscA (main) ──┐
 *   oscB (detune) ┤→ waveshaper → crush → lpFilter → hpFilter → tremoloGain
 *   noise ─────── ┘                                                  │
 *   fmOsc → fmGain → oscA.frequency            ┌──────────────────── ┘
 *   lfoOsc → lfoGain → tremoloGain.gain         │
 *   constant(1) → tremoloGain.gain              ▼
 *                                    dryGain ─────────────────────────┐
 *                                    reverb → reverbGain ─────────────┤→ panner → master → dest
 *                                    delay + feedback → delayGain ────┘
 *   subOsc → subGain ──────────────────────────────────────────────────→ panner
 */

import type { SemanticMapping, TrajectorySegment, CurveType, LayerCategory } from '../ai/types'
import { UsageLogger } from './UsageLogger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: Record<string, number> = {
  gain: 0, wave: 0,
  lpf: 10000, lpq: 1, hpf: 20,
  shape: 0, crush: 0,
  fm: 0, lfo: 0, detune: 0,
  sub: 0, noise: 0,
  room: 0, delay: 0, pan: 0,
}

const CATEGORY_ORDER: LayerCategory[] = [
  'STRUCTURE', 'TIMBRE', 'TEXTURE', 'MOTION', 'EMOTION', 'SPACE',
]

const POLARITY_CYCLE: Array<{ weight: number; polarity: 1 | -1 }> = [
  { weight: 0.6, polarity: 1 },
  { weight: 1.0, polarity: 1 },
  { weight: 0.6, polarity: 1 },
  { weight: 0.0, polarity: 1 },
  { weight: 0.6, polarity: -1 },
  { weight: 1.0, polarity: -1 },
  { weight: 0.6, polarity: -1 },
  { weight: 0.0, polarity: 1 },
]

function getAgeFactor(age: number): number {
  if (age <= 2) return 1.0
  if (age === 3) return 0.75
  if (age === 4) return 0.40
  if (age === 5) return 0.10
  return 0
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

interface Layer {
  id: string
  token: string
  category: LayerCategory
  weight: number
  polarity: 1 | -1
  entryCount: number
  age: number
  trajectory: TrajectorySegment[]
}

// ---------------------------------------------------------------------------
// Trajectory evaluation
// ---------------------------------------------------------------------------

function applyCurve(t: number, curve: CurveType = 'linear'): number {
  switch (curve) {
    case 'easeIn':    return t * t
    case 'easeOut':   return 1 - (1 - t) * (1 - t)
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    case 'exp':       return t === 0 ? 0 : Math.pow(2, 10 * t - 10)
    default:          return t
  }
}

function evalTrajectory(segments: TrajectorySegment[], knob: number): Record<string, number> {
  const byParam = new Map<string, TrajectorySegment[]>()
  for (const seg of segments) {
    if (!byParam.has(seg.param)) byParam.set(seg.param, [])
    byParam.get(seg.param)!.push(seg)
  }
  const result: Record<string, number> = {}
  for (const [param, segs] of byParam) {
    segs.sort((a, b) => a.range[0] - b.range[0])
    let value = segs[0].from
    for (const seg of segs) {
      const [a, b] = seg.range
      if (knob <= a) break
      if (knob <= b) {
        const t = (knob - a) / (b - a)
        value = seg.from + applyCurve(t, seg.curve) * (seg.to - seg.from)
        break
      }
      value = seg.to
    }
    result[param] = value
  }
  return result
}

// ---------------------------------------------------------------------------
// Waveshaping
// ---------------------------------------------------------------------------

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 512
  const curve = new Float32Array(n) as Float32Array<ArrayBuffer>
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = amount === 0 ? x : ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

function makeCrushCurve(bits: number): Float32Array<ArrayBuffer> {
  const steps = Math.pow(2, Math.max(1, bits))
  const n = 256
  const curve = new Float32Array(n) as Float32Array<ArrayBuffer>
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = Math.round(x * steps) / steps
  }
  return curve
}

function createIR(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2.5)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  }
  return buf
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AudioEngine {
  private ctx: AudioContext | null = null

  private oscA!: OscillatorNode
  private oscB!: OscillatorNode
  private oscBGain!: GainNode
  private subOsc!: OscillatorNode
  private subGain!: GainNode
  private fmOsc!: OscillatorNode
  private fmGain!: GainNode
  private noiseSource!: AudioBufferSourceNode
  private noiseGain!: GainNode
  private waveshaper!: WaveShaperNode
  private crushShaper!: WaveShaperNode
  private lpFilter!: BiquadFilterNode
  private hpFilter!: BiquadFilterNode
  private tremoloGain!: GainNode
  private constant!: ConstantSourceNode
  private lfoOsc!: OscillatorNode
  private lfoGain!: GainNode
  private dryGain!: GainNode
  private reverb!: ConvolverNode
  private reverbGain!: GainNode
  private delayNode!: DelayNode
  private delayFeedback!: GainNode
  private delayGain!: GainNode
  private panner!: StereoPannerNode
  private masterGain!: GainNode

  private knobValue = 0
  private baseParams: Record<string, number> = { ...DEFAULT_PARAMS }
  private layers: Layer[] = []
  private lastMapping: SemanticMapping | null = null

  async init(): Promise<void> {
    const ctx = new AudioContext()
    await ctx.resume()
    this.ctx = ctx

    this.oscA = ctx.createOscillator()
    this.oscA.type = 'sawtooth'
    this.oscA.frequency.value = 220

    this.oscB = ctx.createOscillator()
    this.oscB.type = 'sawtooth'
    this.oscB.frequency.value = 220
    this.oscBGain = ctx.createGain()
    this.oscBGain.gain.value = 0
    this.oscB.connect(this.oscBGain)

    this.subOsc = ctx.createOscillator()
    this.subOsc.type = 'sine'
    this.subOsc.frequency.value = 110
    this.subGain = ctx.createGain()
    this.subGain.gain.value = 0
    this.subOsc.connect(this.subGain)

    this.fmOsc = ctx.createOscillator()
    this.fmOsc.type = 'sine'
    this.fmOsc.frequency.value = 220
    this.fmGain = ctx.createGain()
    this.fmGain.gain.value = 0
    this.fmOsc.connect(this.fmGain)
    this.fmGain.connect(this.oscA.frequency)

    this.noiseSource = ctx.createBufferSource()
    this.noiseSource.buffer = createNoiseBuffer(ctx)
    this.noiseSource.loop = true
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0
    this.noiseSource.connect(this.noiseGain)

    this.waveshaper = ctx.createWaveShaper()
    this.waveshaper.curve = makeDistortionCurve(0)
    this.waveshaper.oversample = '4x'

    this.crushShaper = ctx.createWaveShaper()
    this.crushShaper.curve = makeCrushCurve(16)

    this.lpFilter = ctx.createBiquadFilter()
    this.lpFilter.type = 'lowpass'
    this.lpFilter.frequency.value = DEFAULT_PARAMS.lpf
    this.lpFilter.Q.value = DEFAULT_PARAMS.lpq

    this.hpFilter = ctx.createBiquadFilter()
    this.hpFilter.type = 'highpass'
    this.hpFilter.frequency.value = DEFAULT_PARAMS.hpf

    this.tremoloGain = ctx.createGain()
    this.tremoloGain.gain.value = 0
    this.constant = ctx.createConstantSource()
    this.constant.offset.value = 1
    this.constant.connect(this.tremoloGain.gain)
    this.lfoOsc = ctx.createOscillator()
    this.lfoOsc.type = 'sine'
    this.lfoOsc.frequency.value = 0
    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = 0
    this.lfoOsc.connect(this.lfoGain)
    this.lfoGain.connect(this.tremoloGain.gain)

    this.dryGain = ctx.createGain()
    this.dryGain.gain.value = 1
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = createIR(ctx)
    this.reverbGain = ctx.createGain()
    this.reverbGain.gain.value = 0
    this.delayNode = ctx.createDelay(2)
    this.delayNode.delayTime.value = 0.35
    this.delayFeedback = ctx.createGain()
    this.delayFeedback.gain.value = 0.4
    this.delayGain = ctx.createGain()
    this.delayGain.gain.value = 0
    this.panner = ctx.createStereoPanner()
    this.panner.pan.value = 0
    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0

    this.oscA.connect(this.waveshaper)
    this.oscBGain.connect(this.waveshaper)
    this.noiseGain.connect(this.waveshaper)
    this.waveshaper.connect(this.crushShaper)
    this.crushShaper.connect(this.lpFilter)
    this.lpFilter.connect(this.hpFilter)
    this.hpFilter.connect(this.tremoloGain)
    this.tremoloGain.connect(this.dryGain)
    this.dryGain.connect(this.masterGain)
    this.tremoloGain.connect(this.reverb)
    this.reverb.connect(this.reverbGain)
    this.reverbGain.connect(this.masterGain)
    this.tremoloGain.connect(this.delayNode)
    this.delayNode.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delayNode)
    this.delayNode.connect(this.delayGain)
    this.delayGain.connect(this.masterGain)
    this.subGain.connect(this.masterGain)
    this.masterGain.connect(this.panner)
    this.panner.connect(ctx.destination)

    this.oscA.start()
    this.oscB.start()
    this.subOsc.start()
    this.fmOsc.start()
    this.lfoOsc.start()
    this.constant.start()
    this.noiseSource.start()

    // Volume bootstrap layer — makes initial slider a gain control
    this.layers.push({
      id: 'volume',
      token: 'volume',
      category: 'TIMBRE',
      weight: 1.0,
      polarity: 1,
      entryCount: 1,
      age: 0,
      trajectory: [{ range: [0, 1], param: 'gain', from: 0, to: 0.8, curve: 'linear' }],
    })
  }

  /**
   * Add or update a semantic layer.
   *
   * 1. Commits current effective state → baseParams
   * 2. Ages and prunes old layers
   * 3. Rebases existing layer trajectories to new baseParams
   * 4. Adds new layer or cycles the polarity of an existing one
   * 5. Resets knob to 0
   */
  async addLayer(mapping: SemanticMapping): Promise<void> {
    // Commit current effective state
    const committed = this.computeEffective()

    // Log before committing
    if (this.lastMapping) {
      UsageLogger.commit({
        timestamp: new Date().toISOString(),
        term: this.lastMapping.term,
        confidence: this.lastMapping.confidence,
        latent: this.lastMapping.latent as Record<string, number> | undefined,
        aiTrajectory: this.lastMapping.trajectory.map((s) => ({
          range: s.range, param: s.param, from: s.from, to: s.to, curve: s.curve,
        })),
        committedPosition: this.knobValue,
        effectiveParams: { ...committed },
        layerStack: this.layers.map((l) => ({
          token: l.token, category: l.category, weight: l.weight,
          polarity: l.polarity, age: l.age,
        })),
      })
    }

    Object.assign(this.baseParams, committed)

    // Age and prune
    for (const layer of this.layers) layer.age++
    this.layers = this.layers.filter((l) => getAgeFactor(l.age) > 0)

    // Rebase remaining layers to new baseParams
    for (const layer of this.layers) this.rebaseLayer(layer)

    // Gain unlock: ensure audible if no layer controls gain
    const hasGain = this.layers.some((l) => l.trajectory.some((s) => s.param === 'gain'))
    if (!hasGain && this.baseParams.gain < 0.1) {
      this.baseParams.gain = 0.6
    }

    // Add or update layer for this token
    const existing = this.layers.find((l) => l.token === mapping.term && l.token !== 'volume')
    if (existing) {
      existing.entryCount = (existing.entryCount % 8) + 1
      const cycle = POLARITY_CYCLE[existing.entryCount - 1]
      existing.weight = cycle.weight
      existing.polarity = cycle.polarity
      existing.age = 0
      existing.category = mapping.category ?? existing.category
      existing.trajectory = this.adjustTrajectory(mapping.trajectory)
    } else {
      this.layers.push({
        id: `${mapping.term}-${Date.now()}`,
        token: mapping.term,
        category: mapping.category ?? 'TIMBRE',
        weight: POLARITY_CYCLE[0].weight,
        polarity: POLARITY_CYCLE[0].polarity,
        entryCount: 1,
        age: 0,
        trajectory: this.adjustTrajectory(mapping.trajectory),
      })
    }

    this.lastMapping = mapping
    this.knobValue = 0
    this.applyEffectiveParams()
  }

  setKnob(value: number): void {
    this.knobValue = value
    this.applyEffectiveParams()
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** Compute output params at current knob position from base + layer stack. */
  private computeEffective(): Record<string, number> {
    const params: Record<string, number> = { ...this.baseParams }

    const sorted = [...this.layers]
      .filter((l) => l.weight > 0)
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))

    for (const layer of sorted) {
      const ageFactor = getAgeFactor(layer.age)
      if (ageFactor <= 0) continue

      const effectiveWeight = layer.weight * layer.polarity * ageFactor
      const values = evalTrajectory(layer.trajectory, this.knobValue)

      for (const [param, value] of Object.entries(values)) {
        const base = this.baseParams[param] ?? DEFAULT_PARAMS[param] ?? 0
        const delta = (value - base) * effectiveWeight
        params[param] = (params[param] ?? base) + delta
      }
    }

    return params
  }

  private applyEffectiveParams(): void {
    this.applyParams(this.computeEffective())
  }

  /** Set each trajectory's first-segment `from` to current baseParams. */
  private adjustTrajectory(segments: TrajectorySegment[]): TrajectorySegment[] {
    const adjusted = segments.map((s) => ({ ...s }))
    const byParam = new Map<string, number[]>()
    adjusted.forEach((s, i) => {
      if (!byParam.has(s.param)) byParam.set(s.param, [])
      byParam.get(s.param)!.push(i)
    })
    for (const [param, indices] of byParam) {
      indices.sort((a, b) => adjusted[a].range[0] - adjusted[b].range[0])
      const base = this.baseParams[param] ?? DEFAULT_PARAMS[param]
      if (base !== undefined) {
        adjusted[indices[0]] = { ...adjusted[indices[0]], from: base }
      }
    }
    return adjusted
  }

  /** Re-adjust an existing layer's from values to the current baseParams. */
  private rebaseLayer(layer: Layer): void {
    const byParam = new Map<string, number[]>()
    layer.trajectory.forEach((s, i) => {
      if (!byParam.has(s.param)) byParam.set(s.param, [])
      byParam.get(s.param)!.push(i)
    })
    for (const [param, indices] of byParam) {
      indices.sort((a, b) => layer.trajectory[a].range[0] - layer.trajectory[b].range[0])
      const base = this.baseParams[param] ?? DEFAULT_PARAMS[param]
      if (base !== undefined) {
        layer.trajectory[indices[0]] = { ...layer.trajectory[indices[0]], from: base }
      }
    }
  }

  private applyParams(params: Record<string, number>): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const τ = 0.012

    for (const [p, v] of Object.entries(params)) {
      switch (p) {
        case 'gain':
          this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(2, v)), now, τ)
          break
        case 'lpf':
          this.lpFilter.frequency.setTargetAtTime(Math.max(80, Math.min(18000, v)), now, τ)
          break
        case 'lpq':
          this.lpFilter.Q.setTargetAtTime(Math.max(0, Math.min(20, v)), now, τ)
          break
        case 'hpf':
          this.hpFilter.frequency.setTargetAtTime(Math.max(20, Math.min(8000, v)), now, τ)
          break
        case 'shape':
          this.waveshaper.curve = makeDistortionCurve(Math.max(0, Math.min(1, v)) * 500)
          break
        case 'crush': {
          const bits = Math.round(1 + (1 - Math.max(0, Math.min(1, v))) * 15)
          this.crushShaper.curve = makeCrushCurve(bits)
          break
        }
        case 'room': {
          const wet = Math.max(0, Math.min(1, v))
          this.reverbGain.gain.setTargetAtTime(wet * 0.8, now, τ)
          this.dryGain.gain.setTargetAtTime(1 - wet * 0.45, now, τ)
          break
        }
        case 'delay':
          this.delayGain.gain.setTargetAtTime(Math.max(0, Math.min(0.8, v)), now, τ)
          break
        case 'fm':
          this.fmGain.gain.setTargetAtTime(Math.max(0, v) * 30, now, τ)
          break
        case 'lfo': {
          const rate = Math.max(0, Math.min(12, v))
          this.lfoOsc.frequency.setTargetAtTime(rate, now, τ)
          this.lfoGain.gain.setTargetAtTime(rate > 0 ? 0.35 : 0, now, τ)
          break
        }
        case 'detune': {
          const cents = Math.max(-200, Math.min(200, v))
          this.oscB.detune.setTargetAtTime(cents, now, τ)
          this.oscBGain.gain.setTargetAtTime(Math.abs(cents) < 1 ? 0 : 0.6, now, τ)
          break
        }
        case 'sub':
          this.subGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), now, τ)
          break
        case 'noise':
          this.noiseGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.3, now, τ)
          break
        case 'pan':
          this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), now, τ)
          break
        case 'wave': {
          const types: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine']
          this.oscA.type = types[Math.round(Math.max(0, Math.min(3, v)))]
          this.oscB.type = this.oscA.type
          break
        }
      }
    }
  }
}
