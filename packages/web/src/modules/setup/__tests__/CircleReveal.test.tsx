import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CircleReveal } from '../CircleReveal'

describe('CircleReveal', () => {
  it('renders a fixed overlay', () => {
    const { container } = render(<CircleReveal onComplete={() => {}} />)
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.style.position).toBe('fixed')
    expect(overlay.style.zIndex).toBe('9999')
  })

  it('starts with circle(0%) clip-path', () => {
    const { container } = render(<CircleReveal onComplete={() => {}} />)
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.style.clipPath).toBe('circle(0% at 50% 50%)')
  })

  it('expands to circle(150%) after a frame', async () => {
    const { container } = render(<CircleReveal onComplete={() => {}} />)
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 50))
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.style.clipPath).toBe('circle(150% at 50% 50%)')
  })

  it('calls onComplete after the specified duration', async () => {
    const onComplete = vi.fn()
    render(<CircleReveal onComplete={onComplete} duration={100} />)

    expect(onComplete).not.toHaveBeenCalled()

    await new Promise((r) => setTimeout(r, 200))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('uses the default 700ms duration', () => {
    const { container } = render(<CircleReveal onComplete={() => {}} />)
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.style.transition).toContain('700ms')
  })

  it('disables pointer events once done', async () => {
    const { container } = render(<CircleReveal onComplete={() => {}} duration={50} />)

    await new Promise((r) => setTimeout(r, 120))

    const overlay = container.firstElementChild as HTMLElement
    expect(overlay.style.pointerEvents).toBe('none')
  })
})
