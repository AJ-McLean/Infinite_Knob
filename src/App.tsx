import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/AudioEngine'
import { interpret, fallbackMapping } from './ai/SemanticInterpreter'
import { Slider } from './components/ui/slider'
import { AIInputWithLoading } from './components/ui/ai-input-with-loading'
import { HandKnobController } from './components/HandKnobController'

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const initializedRef = useRef(false)
  const [sliderValue, setSliderValue] = useState([0])
  const [cameraActive, setCameraActive] = useState(false)

  const ensureAudio = async () => {
    if (initializedRef.current) return
    initializedRef.current = true
    const engine = new AudioEngine()
    await engine.init()
    engineRef.current = engine
  }

  // 12 major chord roots: 1=C … 0=A, -=Bb, ==B
  const CHORD_ROOTS: Record<string, number> = {
    '1': 261.63, '2': 277.18, '3': 293.66, '4': 311.13,
    '5': 329.63, '6': 349.23, '7': 369.99, '8': 392.00,
    '9': 415.30, '0': 440.00, '-': 466.16, '=': 493.88,
  }

  const activeChordKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Shift') { setCameraActive((v) => !v); return }
      const root = CHORD_ROOTS[e.key]
      if (root) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        await ensureAudio()
        if (activeChordKeyRef.current === e.key) {
          engineRef.current?.stopChordArp()
          activeChordKeyRef.current = null
        } else {
          const third = root * Math.pow(2, 4 / 12)
          const fifth = root * Math.pow(2, 7 / 12)
          engineRef.current?.startChordArp([root, third, fifth])
          activeChordKeyRef.current = e.key
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      engineRef.current?.stopChordArp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <div className="w-full max-w-sm">
        <Slider
          value={sliderValue}
          onValueChange={handleSliderChange}
          min={0}
          max={100}
          step={0.5}
        />
      </div>
      <div className="w-full max-w-sm">
        <AIInputWithLoading onSubmit={handleSubmit} placeholder="describe the sound" />
      </div>
      <HandKnobController
        value={sliderValue[0] ?? 0}
        min={0}
        max={100}
        triggerActive={cameraActive}
        onChange={(v) => handleSliderChange([v])}
      />
    </div>
  )
}
