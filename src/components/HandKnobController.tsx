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
  disabled?: boolean
  onChange: (value: number) => void
}

type HandLandmarkerState = {
  landmarker: HandLandmarker
  running: boolean
}

const VISION_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'

export function HandKnobController({
  value,
  min,
  max,
  disabled,
  onChange,
}: HandKnobControllerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [permissionRequested, setPermissionRequested] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  const handStateRef = useRef<HandLandmarkerState | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const pinchActiveRef = useRef(false)
  const pinchStartXRef = useRef(0)
  const pinchStartValueRef = useRef(0)
  const valueRef = useRef(value)
  valueRef.current = value

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
    if (video) {
      video.srcObject = null
    }

    pinchActiveRef.current = false
    setActive(false)
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const handleGesture = useCallback(
    (result: HandLandmarkerResult) => {
      if (!result.landmarks?.length || disabled) return

      const landmarks = result.landmarks[0]
      if (!landmarks || landmarks.length < 9) return

      const thumbTip = landmarks[4]
      const indexTip = landmarks[8]

      const dx = thumbTip.x - indexTip.x
      const dy = thumbTip.y - indexTip.y
      const distance = Math.hypot(dx, dy)

      const PINCH_THRESHOLD = 0.06
      const isPinching = distance < PINCH_THRESHOLD

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

      const DEAD_ZONE = 0.015
      const move = x - pinchStartXRef.current
      if (Math.abs(move) < DEAD_ZONE) return

      const SENSITIVITY = 1.5
      const range = max - min
      // Flip the direction so moving your hand right increases the knob
      const delta = (pinchStartXRef.current - x) * SENSITIVITY * range
      const next = Math.min(max, Math.max(min, pinchStartValueRef.current + delta))

      onChange(next)
    },
    [disabled, max, min, onChange]
  )

  const detectionLoop = useCallback(() => {
    const state = handStateRef.current
    const video = videoRef.current
    if (!state || !video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(detectionLoop)
      return
    }

    const now = performance.now()
    const result = state.landmarker.detectForVideo(video, now)
    if (result) {
      handleGesture(result)
    }

    animationFrameRef.current = requestAnimationFrame(detectionLoop)
  }, [handleGesture])

  const start = useCallback(async () => {
    if (active || disabled) return
    setPermissionRequested(true)
    setPermissionError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
        },
        audio: false,
      })

      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        throw new Error('Video element missing')
      }

      video.srcObject = stream

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(() => resolve())
        }
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

      handStateRef.current = { landmarker, running: true }
      setActive(true)

      animationFrameRef.current = requestAnimationFrame(detectionLoop)
    } catch (err) {
      console.error(err)
      setPermissionError(
        err instanceof Error ? err.message : 'Unable to access camera or start hand tracking.'
      )
      cleanup()
    }
  }, [active, cleanup, detectionLoop, disabled])

  return (
    <div className="flex flex-col items-center gap-3 text-xs text-black/60">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={disabled || active}
          className="px-3 py-1.5 rounded-full border border-black/10 bg-black/[0.03] hover:bg-black/[0.06] disabled:opacity-40 text-xs"
        >
          {active ? 'Camera control active' : 'Enable camera knob control'}
        </button>
        {permissionRequested && !active && !permissionError && (
          <p className="text-[11px] text-black/50">
            If prompted, allow camera access to control the knob with your hand.
          </p>
        )}
        {permissionError && (
          <p className="text-[11px] text-red-600 max-w-xs text-center">{permissionError}</p>
        )}
      </div>

      <p className="text-[11px] max-w-xs text-center leading-snug">
        <span className="font-semibold">Camera privacy:</span> video stays on your device. Hand
        landmarks are computed locally in your browser to control the knob; no images or video are
        sent to any server.
      </p>

      <video
        ref={videoRef}
        playsInline
        muted
        className="w-24 h-16 rounded-md border border-black/5 object-cover opacity-40"
      />
    </div>
  )
}

