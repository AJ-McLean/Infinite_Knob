declare module '@strudel/webaudio' {
  export function webaudioRepl(options?: Record<string, unknown>): {
    evaluate: (code: string, autostart?: boolean) => Promise<unknown>
    start: () => void
    stop: () => void
    scheduler: { start: () => void; stop: () => void }
    state: Record<string, unknown>
  }
  export function initAudio(options?: Record<string, unknown>): Promise<void>
  export function registerSynthSounds(): void
  export function webaudioOutput(...args: unknown[]): unknown
}

declare module '@strudel/core' {
  export function evalScope(...args: unknown[]): Promise<unknown[]>
  export const signal: (fn: (t?: number) => number) => unknown
}

declare module '@strudel/mini' {
  export function mini(code: string): unknown
}
