import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type GyroKnobControllerProps = {
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
  children: React.ReactNode
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function isProbablyMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS sometimes reports as Mac; include touch-capable check.
  const touchCapable =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 0)

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || touchCapable
}

export function GyroKnobController({
  value,
  min,
  max,
  disabled,
  onChange,
  children,
}: GyroKnobControllerProps) {
  const mobile = useMemo(() => isProbablyMobile(), [])
  const supported =
    mobile && typeof window !== 'undefined' && typeof (window as any).DeviceOrientationEvent !== 'undefined'

  const [holding, setHolding] = useState(false)
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')

  // Always-current refs so listeners never go stale
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const minRef = useRef(min)
  minRef.current = min
  const maxRef = useRef(max)
  maxRef.current = max

  const startGammaRef = useRef<number | null>(null)
  const startValueRef = useRef(0)
  const holdingRef = useRef(false)
  holdingRef.current = holding

  const detach = useCallback(() => {
    window.removeEventListener('deviceorientation', onOrientation as any)
    startGammaRef.current = null
  }, [])

  function onOrientation(e: DeviceOrientationEvent) {
    if (!holdingRef.current || disabled) return
    const gamma = typeof e.gamma === 'number' ? e.gamma : null
    if (gamma == null) return

    if (startGammaRef.current == null) {
      startGammaRef.current = gamma
      startValueRef.current = valueRef.current
      return
    }

    const deltaGamma = gamma - startGammaRef.current

    // Dead zone to ignore jitter near start.
    const DEAD_DEG = 2
    if (Math.abs(deltaGamma) < DEAD_DEG) return

    // Conservative mapping: clamp ±20° and map to ±35% of the slider range.
    const CLAMP_DEG = 20
    const clamped = clamp(deltaGamma, -CLAMP_DEG, CLAMP_DEG)
    const range = maxRef.current - minRef.current
    const MAX_FRACTION = 0.35
    const deltaValue = (clamped / CLAMP_DEG) * (range * MAX_FRACTION)

    const next = clamp(startValueRef.current + deltaValue, minRef.current, maxRef.current)
    onChangeRef.current(next)
  }

  const requestPermissionIfNeeded = useCallback(async () => {
    const DOE = (window as any).DeviceOrientationEvent as any
    if (!DOE) return false
    if (typeof DOE.requestPermission !== 'function') {
      setPermission('granted')
      return true
    }
    try {
      const res = await DOE.requestPermission()
      const ok = res === 'granted'
      setPermission(ok ? 'granted' : 'denied')
      return ok
    } catch {
      setPermission('denied')
      return false
    }
  }, [])

  const startHold = useCallback(
    async (e: React.PointerEvent | React.TouchEvent) => {
      if (!supported || disabled) return

      // Important: iOS requires this to be called from a user gesture.
      if (permission !== 'granted') {
        const ok = await requestPermissionIfNeeded()
        if (!ok) return
      }

      // Avoid selecting text / scrolling while holding.
      if ('preventDefault' in e) e.preventDefault()

      setHolding(true)
      // Attach lazily for battery/perf.
      window.addEventListener('deviceorientation', onOrientation as any, { passive: true })
    },
    [disabled, permission, requestPermissionIfNeeded, supported]
  )

  const endHold = useCallback(() => {
    if (!holdingRef.current) return
    setHolding(false)
    detach()
  }, [detach])

  useEffect(() => {
    if (!supported) return
    // Safety: always detach on unmount.
    return () => {
      try {
        detach()
      } catch {
        // ignore
      }
    }
  }, [detach, supported])

  useEffect(() => {
    if (!holding) return
    // End hold if parent disables the controller.
    if (disabled) endHold()
  }, [disabled, endHold, holding])

  if (!supported) {
    return <>{children}</>
  }

  return (
    <div
      // Pointer events cover mouse + touch; on iOS Safari, touch events are still useful.
      onPointerDown={startHold as any}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onPointerLeave={endHold}
      onTouchStart={startHold as any}
      onTouchEnd={endHold}
      onTouchCancel={endHold}
      style={{
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  )
}

