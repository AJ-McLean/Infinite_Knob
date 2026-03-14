export type CapabilityParam =
  | 'gain' | 'wave'
  | 'lpf' | 'lpq' | 'hpf'
  | 'shape' | 'crush'
  | 'fm' | 'lfo' | 'detune'
  | 'sub' | 'noise'
  | 'room' | 'delay' | 'pan'

/**
 * Processing order: STRUCTURE → TIMBRE → TEXTURE → MOTION → EMOTION → SPACE
 * Later categories apply their deltas on top of earlier ones.
 */
export type LayerCategory = 'STRUCTURE' | 'TIMBRE' | 'TEXTURE' | 'MOTION' | 'EMOTION' | 'SPACE'

export type CurveType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'exp'

export interface TrajectorySegment {
  range: [number, number]
  param: CapabilityParam
  from: number
  to: number
  curve?: CurveType
}

export interface LatentDimensions {
  brightness?: number
  roughness?: number
  distance?: number
  instability?: number
  blur?: number
  motion?: number
  weight?: number
  strain?: number
  [key: string]: number | undefined
}

export interface SemanticMapping {
  term: string
  confidence: number
  description?: string
  category?: LayerCategory
  latent?: LatentDimensions
  trajectory: TrajectorySegment[]
}
