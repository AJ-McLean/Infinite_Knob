export class AudioEngine {
  private ctx: AudioContext | null = null
  private osc: OscillatorNode | null = null
  private filter: BiquadFilterNode | null = null
  private waveshaper: WaveShaperNode | null = null
  private dryGain: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private reverbGain: GainNode | null = null
  private masterGain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private lfo: OscillatorNode | null = null
  private lfoGain: GainNode | null = null
  private _running = false

  async init(): Promise<void> {
    this.ctx = new AudioContext()

    this.osc = this.ctx.createOscillator()
    this.osc.type = 'sine'
    this.osc.frequency.value = 220

    this.filter = this.ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 6000
    this.filter.Q.value = 0.8

    this.waveshaper = this.ctx.createWaveShaper()
    this.waveshaper.curve = makeDistortionCurve(0)
    this.waveshaper.oversample = '4x'

    this.dryGain = this.ctx.createGain()
    this.dryGain.gain.value = 0.85

    this.reverb = this.ctx.createConvolver()
    this.reverb.buffer = createImpulseResponse(this.ctx, 2.5, 2.0)

    this.reverbGain = this.ctx.createGain()
    this.reverbGain.gain.value = 0.08

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.7

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.85

    this.lfo = this.ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 0

    this.lfoGain = this.ctx.createGain()
    this.lfoGain.gain.value = 0

    // osc → filter → waveshaper → dryGain → masterGain → analyser → dest
    this.osc.connect(this.filter)
    this.filter.connect(this.waveshaper)
    this.waveshaper.connect(this.dryGain)
    this.dryGain.connect(this.masterGain)

    // reverb path: waveshaper → reverb → reverbGain → masterGain
    this.waveshaper.connect(this.reverb)
    this.reverb.connect(this.reverbGain)
    this.reverbGain.connect(this.masterGain)

    this.masterGain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)

    // lfo → osc.detune
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.osc.detune)
  }

  start(): void {
    if (!this.ctx || this._running) return
    this.osc!.start()
    this.lfo!.start()
    this._running = true
  }

  setParameter(name: string, value: number): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const ramp = 0.04

    switch (name) {
      case 'lpf':
        this.filter!.frequency.linearRampToValueAtTime(
          Math.max(80, Math.min(20000, value)),
          now + ramp
        )
        break
      case 'gain':
        this.masterGain!.gain.linearRampToValueAtTime(
          Math.max(0, Math.min(1, value)),
          now + ramp
        )
        break
      case 'room': {
        const wet = Math.max(0, Math.min(1, value))
        this.reverbGain!.gain.linearRampToValueAtTime(wet * 0.9, now + ramp)
        this.dryGain!.gain.linearRampToValueAtTime(1 - wet * 0.4, now + ramp)
        break
      }
      case 'detune':
        this.osc!.detune.linearRampToValueAtTime(value, now + ramp)
        break
      case 'distortion':
        this.waveshaper!.curve = makeDistortionCurve(
          Math.max(0, Math.min(1, value)) * 500
        )
        break
      case 'lfo_rate':
        this.lfo!.frequency.linearRampToValueAtTime(
          Math.max(0.1, Math.min(12, value)),
          now + ramp
        )
        break
      case 'lfo_depth':
        this.lfoGain!.gain.linearRampToValueAtTime(
          Math.max(0, Math.min(200, value)),
          now + ramp
        )
        break
    }
  }

  resetParameters(): void {
    if (!this.ctx) return
    this.setParameter('lpf', 6000)
    this.setParameter('gain', 0.7)
    this.setParameter('room', 0.08)
    this.setParameter('detune', 0)
    this.setParameter('distortion', 0)
    this.setParameter('lfo_rate', 0)
    this.setParameter('lfo_depth', 0)
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  get running(): boolean {
    return this._running
  }

  suspend(): void {
    this.ctx?.suspend()
  }

  resume(): void {
    this.ctx?.resume()
  }
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256
  const curve = new Float32Array(n) as Float32Array<ArrayBuffer>
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] =
      amount === 0
        ? x
        : ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

function createImpulseResponse(
  ctx: AudioContext,
  duration: number,
  decay: number
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      data[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}
