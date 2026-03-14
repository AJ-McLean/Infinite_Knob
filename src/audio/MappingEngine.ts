import type { SemanticMapping } from '../ai/types'
import type { AudioEngine } from './AudioEngine'

export function applyMapping(
  engine: AudioEngine,
  mapping: SemanticMapping,
  knob: number // 0 to 1
): void {
  for (const m of mapping.soundMappings) {
    const value = m.startValue + knob * (m.endValue - m.startValue)
    engine.setParameter(m.parameter, value)
  }
}
