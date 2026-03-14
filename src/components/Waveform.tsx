import { useEffect, useRef } from 'react'

interface WaveformProps {
  analyser: AnalyserNode | null
  active: boolean
}

export function Waveform({ analyser, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    if (!analyser || !active) {
      ctx.clearRect(0, 0, W, H)
      // Draw idle flat line
      ctx.strokeStyle = '#1e1e1e'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      return
    }

    const bufferLength = analyser.fftSize
    const data = new Float32Array(bufferLength)

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      analyser.getFloatTimeDomainData(data)

      ctx.clearRect(0, 0, W, H)

      ctx.strokeStyle = '#c4873a'
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.75
      ctx.beginPath()

      const step = W / bufferLength
      let x = 0
      for (let i = 0; i < bufferLength; i++) {
        const y = (data[i] * 0.5 + 0.5) * H
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        x += step
      }

      ctx.stroke()
      ctx.globalAlpha = 1
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [analyser, active])

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={72}
      style={{ display: 'block', width: '100%', maxWidth: 480 }}
    />
  )
}
