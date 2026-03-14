import { useCallback, useRef, useState } from 'react'
import { AudioEngine } from './audio/AudioEngine'
import { interpret, fallbackMapping } from './ai/SemanticInterpreter'
import { Slider } from './components/ui/slider'
import { AIInputWithLoading } from './components/ui/ai-input-with-loading'
import { HandKnobController } from './components/HandKnobController'

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const initializedRef = useRef(false)
  const [sliderValue, setSliderValue] = useState([0])

  const ensureAudio = async () => {
    if (initializedRef.current) return
    initializedRef.current = true
    const engine = new AudioEngine()
    await engine.init()
    engineRef.current = engine
  }

  const handleSliderChange = useCallback(async (values: number[]) => {
    await ensureAudio()
    setSliderValue(values)
    engineRef.current?.setKnob(values[0] / 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (text: string) => {
    await ensureAudio()
    const result = await interpret(text).catch(() => fallbackMapping(text))
    setSliderValue([0])
    await engineRef.current?.addLayer(result)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-10 px-10">
      <h1 className="text-5xl font-light tracking-tight text-black select-none">infinite knob</h1>
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <Slider
          value={sliderValue}
          onValueChange={handleSliderChange}
          min={0}
          max={100}
          step={0.5}
        />
        <HandKnobController
          value={sliderValue[0] ?? 0}
          min={0}
          max={100}
          disabled={!mapping}
          onChange={(v) => handleSliderChange([v])}
        />
      </div>
      <div className="w-full max-w-sm">
        <AIInputWithLoading onSubmit={handleSubmit} placeholder="describe the sound" />
      </div>
    </div>
  )
}
