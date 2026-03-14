export type CapabilityParam = 'lpf' | 'lpq' | 'gain' | 'shape' | 'delay' | 'room' | 'fm' | 'lfo'

export interface ParamMapping {
  param: CapabilityParam
  from: number
  to: number
}

export interface SemanticMapping {
  term: string
  confidence: number
  description?: string
  mappings: ParamMapping[]
}
