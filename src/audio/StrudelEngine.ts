import { webaudioRepl, initAudio, registerSynthSounds } from '@strudel/webaudio'
import { evalScope } from '@strudel/core'
import * as core from '@strudel/core'
import type { SemanticMapping } from '../ai/types'

// Map capability spec param names → Strudel chain function names
const PARAM_FN: Record<string, string> = {
  lpf: 'lpf',
  lpq: 'lpq',
  gain: 'gain',
  shape: 'shape',
  delay: 'delay',
  room: 'room',
  fm: 'fm',
  lfo: 'tremolo',
}

// Sawtooth has rich harmonics — lpf, shape, room all have dramatic audible effect
const BASE = 'note(48).s("sawtooth").sustain(100).gain(0.6)'

function lerp(a: number, b: number, t: number) {
  return a + t * (b - a)
}

type Repl = ReturnType<typeof webaudioRepl>

export class StrudelEngine {
  private repl: Repl | null = null
  private mapping: SemanticMapping | null = null
  private knobValue = 0
  private pendingTimer: ReturnType<typeof setTimeout> | null = null

  async init(): Promise<void> {
    // Register built-in synth waveforms (sine, sawtooth, square, triangle)
    // Must happen before any evaluate() call that uses s("sawtooth") etc.
    registerSynthSounds()

    // Load AudioWorklets and resume the AudioContext
    await initAudio()

    this.repl = webaudioRepl()

    // Inject all Strudel functions (note, s, lpf, room, gain, shape, delay, fm, tremolo…)
    // into globalThis so they're callable from evaluated code strings
    await evalScope(core)

    // Prime with the base drone tone
    await this.repl.evaluate(BASE)
    this.repl.start()
  }

  async loadMapping(mapping: SemanticMapping): Promise<void> {
    this.mapping = mapping
    this.knobValue = 0
    await this.evaluate()
  }

  setKnob(value: number): void {
    this.knobValue = value
    if (!this.mapping) return

    // Debounce re-evaluation — at most ~16 per second while dragging
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null
      this.evaluate()
    }, 60)
  }

  private async evaluate(): Promise<void> {
    if (!this.repl || !this.mapping) return
    try {
      await this.repl.evaluate(this.buildCode())
    } catch {
      // Instrument always plays
    }
  }

  private buildCode(): string {
    if (!this.mapping) return BASE
    let code = BASE
    for (const m of this.mapping.mappings) {
      const fn = PARAM_FN[m.param] ?? m.param
      const value = lerp(m.from, m.to, this.knobValue)
      code += `.${fn}(${value.toFixed(3)})`
    }
    return code
  }
}
