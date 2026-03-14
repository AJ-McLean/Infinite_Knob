export type ParameterName =
  | 'lpf'
  | 'gain'
  | 'room'
  | 'detune'
  | 'distortion'
  | 'lfo_rate'
  | 'lfo_depth'

export interface ParameterMapping {
  parameter: ParameterName
  startValue: number
  endValue: number
}

export interface SemanticMapping {
  concept: string
  description: string
  soundMappings: ParameterMapping[]
}
