import { useCallback, useRef, useState } from 'react'
import { AudioEngine } from './audio/AudioEngine'
import { applyMapping } from './audio/MappingEngine'
import { interpret, fallbackMapping } from './ai/SemanticInterpreter'
import type { SemanticMapping } from './ai/types'
import { Slider } from './components/ui/slider'
import { AIInputWithLoading } from './components/ui/ai-input-with-loading'

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const initializedRef = useRef(false)
  const [sliderValue, setSliderValue] = useState([0])
  const [mapping, setMapping] = useState<SemanticMapping | null>(null)

  const ensureAudio = async () => {
    if (initializedRef.current) return
    initializedRef.current = true
    const engine = new AudioEngine()
    await engine.init()
    engine.start()
    engineRef.current = engine
  }

  const handleSliderChange = useCallback(
    async (values: number[]) => {
      await ensureAudio()
      setSliderValue(values)
      if (engineRef.current && mapping) {
        applyMapping(engineRef.current, mapping, values[0] / 100)
      }
    },
    [mapping]
  )

  const handleSubmit = async (text: string) => {
    await ensureAudio()
    const result = await interpret(text).catch(() => fallbackMapping(text))
    setMapping(result)
    setSliderValue([0])
    if (engineRef.current) {
      applyMapping(engineRef.current, result, 0)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-10 px-10">
      <h1 className="text-5xl font-light tracking-tight text-black select-none">infinite knob</h1>
      <div className="w-full max-w-sm">
        <Slider
          value={sliderValue}
          onValueChange={handleSliderChange}
          min={0}
          max={100}
          step={0.5}
          disabled={!mapping}
        />
      </div>
      <div className="w-full max-w-sm">
        <AIInputWithLoading onSubmit={handleSubmit} placeholder="describe the sound" />
      </div>
    </div>
  )
}
