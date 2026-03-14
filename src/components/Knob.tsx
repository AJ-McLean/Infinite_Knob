import { useEffect, useRef } from 'react'

interface KnobProps {
  value: number // 0 to 1
  onChange: (value: number) => void
  disabled?: boolean
}

const SIZE = 180
const CENTER = SIZE / 2
const RADIUS = 68
const TRACK_RADIUS = 72
// 300° range: from 210° to 510° (= 150°) in standard math angles
// In SVG/CSS: 0° is 12 o'clock, clockwise
// We use: start at -240° (-4π/3) from top, end at +60° (π/3) from top
const START_DEG = -240 // CCW from top
const END_DEG = 60    // CW from top
const TOTAL_DEG = END_DEG - START_DEG // 300

function polarToXY(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [CENTER + r * Math.cos(rad), CENTER + r * Math.sin(rad)]
}

function arcPath(startDeg: number, endDeg: number, r: number): string {
  const [x1, y1] = polarToXY(startDeg, r)
  const [x2, y2] = polarToXY(endDeg, r)
  const spanDeg = endDeg - startDeg
  const largeArc = Math.abs(spanDeg) > 180 ? 1 : 0
  const sweep = spanDeg > 0 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`
}

export function Knob({ value, onChange, disabled = false }: KnobProps) {
  const dragRef = useRef({ active: false, startY: 0, startValue: 0 })

  const currentDeg = START_DEG + value * TOTAL_DEG
  const [indX, indY] = polarToXY(currentDeg, RADIUS * 0.62)

  const trackPath = arcPath(START_DEG, END_DEG, TRACK_RADIUS)
  const valuePath = value > 0.001
    ? arcPath(START_DEG, currentDeg, TRACK_RADIUS)
    : ''

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    dragRef.current = { active: true, startY: e.clientY, startValue: value }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      const delta = (dragRef.current.startY - e.clientY) / 220
      const next = Math.max(0, Math.min(1, dragRef.current.startValue + delta))
      onChange(next)
    }
    const onUp = () => { dragRef.current.active = false }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onChange])

  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      if (!dragRef.current.active) return
      const delta = (dragRef.current.startY - e.touches[0].clientY) / 220
      const next = Math.max(0, Math.min(1, dragRef.current.startValue + delta))
      onChange(next)
    }
    const onTouchUp = () => { dragRef.current.active = false }

    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchend', onTouchUp)
    return () => {
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchend', onTouchUp)
    }
  }, [onChange])

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    dragRef.current = { active: true, startY: e.touches[0].clientY, startValue: value }
  }

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ cursor: disabled ? 'default' : 'ns-resize', userSelect: 'none' }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Shadow */}
      <circle
        cx={CENTER}
        cy={CENTER + 2}
        r={RADIUS + 4}
        fill="rgba(0,0,0,0.5)"
        filter="url(#blur)"
      />
      <defs>
        <filter id="blur">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <radialGradient id="knobGrad" cx="45%" cy="38%" r="60%">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#111111" />
        </radialGradient>
      </defs>

      {/* Track background */}
      <path
        d={trackPath}
        fill="none"
        stroke="#1e1e1e"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Value arc */}
      {valuePath && (
        <path
          d={valuePath}
          fill="none"
          stroke={disabled ? '#3a3a3a' : '#c4873a'}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={disabled ? 0.4 : 1}
        />
      )}

      {/* Knob body */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="url(#knobGrad)"
        stroke="#2c2c2c"
        strokeWidth="1.5"
      />

      {/* Indicator dot */}
      <circle
        cx={indX}
        cy={indY}
        r={3.5}
        fill={disabled ? '#3a3a3a' : '#c4873a'}
        opacity={disabled ? 0.4 : 1}
      />
    </svg>
  )
}
