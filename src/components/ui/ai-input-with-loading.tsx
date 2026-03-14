import { CornerRightUp } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAutoResizeTextarea } from '@/components/hooks/use-auto-resize-textarea'

interface AIInputWithLoadingProps {
  id?: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  loadingDuration?: number
  onSubmit?: (value: string) => void | Promise<void>
  className?: string
}

export function AIInputWithLoading({
  id = 'ai-input',
  placeholder = 'describe the sound',
  minHeight = 52,
  maxHeight = 200,
  loadingDuration = 0,
  onSubmit,
  className,
}: AIInputWithLoadingProps) {
  const [inputValue, setInputValue] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight, maxHeight })

  const handlePointerUp = useCallback(() => {
    // no-op — loading clears when onSubmit resolves
  }, [])

  useEffect(() => {
    document.addEventListener('pointerup', handlePointerUp)
    return () => document.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerUp])

  const handleSubmit = async () => {
    if (!inputValue.trim() || submitted) return
    setSubmitted(true)
    await onSubmit?.(inputValue)
    setInputValue('')
    adjustHeight(true)
    setTimeout(() => setSubmitted(false), Math.max(loadingDuration, 0))
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="relative max-w-xl w-full mx-auto">
        <Textarea
          id={id}
          placeholder={placeholder}
          className={cn(
            'max-w-xl bg-black/[0.03] w-full rounded-3xl pl-6 pr-12 py-4',
            'placeholder:text-black/25',
            'border border-black/[0.06]',
            'text-black resize-none text-wrap leading-[1.4]',
            'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-black/20',
            'shadow-none transition-colors',
            `min-h-[${minHeight}px]`
          )}
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            adjustHeight()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={submitted}
        />
        <button
          onClick={handleSubmit}
          className={cn(
            'absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-opacity',
            submitted ? 'opacity-40' : inputValue ? 'opacity-60 hover:opacity-100' : 'opacity-20'
          )}
          type="button"
          disabled={submitted}
        >
          {submitted ? (
            <div
              className="w-4 h-4 bg-black rounded-sm animate-spin"
              style={{ animationDuration: '3s' }}
            />
          ) : (
            <CornerRightUp className="w-4 h-4 text-black" />
          )}
        </button>
      </div>
    </div>
  )
}
