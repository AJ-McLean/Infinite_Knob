import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'

type HandKnobControllerProps = {
  value: number
  min: number
  max: number
  triggerActive: boolean
  onChange: (value: number) => void
}

type HandLandmarkerState = {
  landmarker: HandLandmarker
}

const VISION_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'

export function HandKnobController({
  value,
  min,
  max,
  triggerActive,
  onChange,
}: HandKnobControllerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [active, setActive] = useState(false)

  const handStateRef = useRef<HandLandmarkerState | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Always-current refs so the detection loop never goes stale
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const minRef = useRef(min)
  minRef.current = min
  const maxRef = useRef(max)
  maxRef.current = max
  const valueRef = useRef(value)
  valueRef.current = value

  const pinchActiveRef = useRef(false)
  const pinchStartXRef = useRef(0)
  const pinchStartValueRef = useRef(0)

  const cleanup = useCallback(() => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    handStateRef.current?.landmarker.close()
    handStateRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    const video = videoRef.current
    if (video) video.srcObject = null

    pinchActiveRef.current = false
    setActive(false)
  }, [])

  useEffect(() => {
    return () => { cleanup() }
  }, [cleanup])

  // Stable detection loop — reads latest values from refs, never recreated
  const detectionLoop = useCallback(() => {
    const state = handStateRef.current
    const video = videoRef.current
    if (!state || !video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(detectionLoop)
      return
    }

    const result = state.landmarker.detectForVideo(video, performance.now())
    if (result) handleGesture(result)

    animationFrameRef.current = requestAnimationFrame(detectionLoop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — reads everything from refs

  function handleGesture(result: HandLandmarkerResult) {
    if (!result.landmarks?.length) return

    const landmarks = result.landmarks[0]
    if (!landmarks || landmarks.length < 9) return

    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]

    const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
    const isPinching = distance < 0.06
    const x = indexTip.x

    if (isPinching && !pinchActiveRef.current) {
      pinchActiveRef.current = true
      pinchStartXRef.current = x
      pinchStartValueRef.current = valueRef.current
      return
    }

    if (!isPinching && pinchActiveRef.current) {
      pinchActiveRef.current = false
      return
    }

    if (!isPinching || !pinchActiveRef.current) return

    const move = x - pinchStartXRef.current
    if (Math.abs(move) < 0.015) return

    const range = maxRef.current - minRef.current
    const delta = (pinchStartXRef.current - x) * 1.5 * range
    const next = Math.min(maxRef.current, Math.max(minRef.current, pinchStartValueRef.current + delta))
    onChangeRef.current(next)
  }

  const start = useCallback(async () => {
    if (active) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('Video element missing')

      video.srcObject = stream
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => { video.play().then(() => resolve()) }
      })

      const filesetResolver = await FilesetResolver.forVisionTasks(VISION_WASM_BASE)
      const landmarker = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        },
        numHands: 1,
        runningMode: 'VIDEO',
      })

      handStateRef.current = { landmarker }
      setActive(true)
      animationFrameRef.current = requestAnimationFrame(detectionLoop)
    } catch (err) {
      console.error('[HandKnob]', err)
      cleanup()
    }
  }, [active, cleanup, detectionLoop])

  useEffect(() => {
    if (triggerActive && !active) start()
    if (!triggerActive && active) cleanup()
  }, [triggerActive, active, start, cleanup])

  return <video ref={videoRef} playsInline muted className="hidden" />
}
