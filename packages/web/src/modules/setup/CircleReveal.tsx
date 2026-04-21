import { useEffect, useState } from 'react'

interface CircleRevealProps {
  onComplete: () => void
  duration?: number
}

export function CircleReveal({ onComplete, duration = 700 }: CircleRevealProps) {
  const [phase, setPhase] = useState<'idle' | 'expanding' | 'done'>('idle')

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('expanding'))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (phase !== 'expanding') return
    const timer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)
    return () => clearTimeout(timer)
  }, [phase, duration, onComplete])

  const clipPath =
    phase === 'expanding' || phase === 'done'
      ? 'circle(150% at 50% 50%)'
      : 'circle(0% at 50% 50%)'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'hsl(var(--background))',
        clipPath,
        transition: `clip-path ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: phase === 'done' ? 'none' : 'auto',
      }}
    />
  )
}
