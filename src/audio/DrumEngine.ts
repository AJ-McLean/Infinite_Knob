/**
 * Synthesized drum engine — pure Web Audio, no samples.
 *
 * Kick:  sine oscillator with rapid pitch decay (150 → 40 Hz)
 * Snare: triangle tone + highpassed noise burst
 * Hihat: highpassed noise, very short envelope
 *
 * Scheduling uses the standard Web Audio lookahead pattern:
 *   setInterval fires every 25ms, schedules any steps in the next 100ms window.
 */

type PatternName = 'basic' | 'techno' | 'groove' | 'sparse' | 'jungle'

interface Pattern {
  kick:  number[]
  snare: number[]
  hihat: number[]
}

const PATTERNS: Record<PatternName, Pattern> = {
  basic: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  techno: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
  },
  groove: {
    kick:  [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    hihat: [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,0],
  },
  sparse: {
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat: [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
  },
  jungle: {
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,1,0,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
    hihat: [1,0,1,1, 0,1,1,0, 1,0,1,0, 1,1,0,1],
  },
}

function patternForBpm(bpm: number): PatternName {
  if (bpm < 85)  return 'sparse'
  if (bpm < 110) return 'groove'
  if (bpm < 135) return 'basic'
  if (bpm < 160) return 'techno'
  return 'jungle'
}

function makeNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

export class DrumEngine {
  private ctx: AudioContext
  private master: GainNode

  private level = 0
  private bpm = 120

  private schedulerId: ReturnType<typeof setInterval> | null = null
  private nextStepTime = 0
  private stepIndex = 0

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
  }

  start() {
    if (this.schedulerId !== null) return
    this.nextStepTime = this.ctx.currentTime + 0.05
    this.stepIndex = 0
    this.schedulerId = setInterval(() => this.tick(), 25)
  }

  stop() {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId)
      this.schedulerId = null
    }
  }

  setLevel(value: number) {
    this.level = Math.max(0, Math.min(1, value))
    this.master.gain.setTargetAtTime(this.level * 0.75, this.ctx.currentTime, 0.05)
  }

  setBpm(value: number) {
    this.bpm = Math.max(60, Math.min(200, value))
  }

  private tick() {
    const LOOKAHEAD = 0.1
    const stepDuration = 60 / this.bpm / 4  // 16th note

    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.stepIndex % 16, this.nextStepTime)
      this.nextStepTime += stepDuration
      this.stepIndex++
    }
  }

  private scheduleStep(step: number, time: number) {
    if (this.level <= 0) return
    const pat = PATTERNS[patternForBpm(this.bpm)]
    // Hit probability scales with level — sparse at low values, dense at 1
    const prob = Math.min(1, this.level * 1.5)

    if (pat.kick[step]  && Math.random() < prob)        this.kick(time)
    if (pat.snare[step] && Math.random() < prob * 0.9)  this.snare(time)
    if (pat.hihat[step] && Math.random() < prob * 0.75) this.hihat(time)
  }

  private kick(time: number) {
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.connect(gain)
    gain.connect(this.master)

    osc.frequency.setValueAtTime(150, time)
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08)
    gain.gain.setValueAtTime(1.0, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38)

    osc.start(time)
    osc.stop(time + 0.38)
  }

  private snare(time: number) {
    // Tonal body
    const osc = this.ctx.createOscillator()
    const oscGain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 185
    osc.connect(oscGain)
    oscGain.connect(this.master)
    oscGain.gain.setValueAtTime(0.5, time)
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12)
    osc.start(time)
    osc.stop(time + 0.12)

    // Noise snap
    const src = this.ctx.createBufferSource()
    src.buffer = makeNoiseBuffer(this.ctx, 0.25)
    const hpf = this.ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 1500
    const noiseGain = this.ctx.createGain()
    src.connect(hpf)
    hpf.connect(noiseGain)
    noiseGain.connect(this.master)
    noiseGain.gain.setValueAtTime(0.75, time)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2)
    src.start(time)
    src.stop(time + 0.2)
  }

  private hihat(time: number) {
    const src = this.ctx.createBufferSource()
    src.buffer = makeNoiseBuffer(this.ctx, 0.1)
    const hpf = this.ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 7000
    const gain = this.ctx.createGain()
    src.connect(hpf)
    hpf.connect(gain)
    gain.connect(this.master)
    gain.gain.setValueAtTime(0.35, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06)
    src.start(time)
    src.stop(time + 0.06)
  }
}
