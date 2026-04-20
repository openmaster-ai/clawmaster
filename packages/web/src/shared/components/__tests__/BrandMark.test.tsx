import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from '../BrandMark'

describe('BrandMark', () => {
  it('renders the animated asset when requested', () => {
    render(<BrandMark animated alt="ClawMaster animated logo" className="h-10 w-10" />)

    expect(screen.getByRole('img', { name: 'ClawMaster animated logo' })).toHaveAttribute('src', '/logo-animated.svg')
  })

  it('renders the static asset by default', () => {
    render(<BrandMark alt="ClawMaster static logo" className="h-10 w-10" />)

    expect(screen.getByRole('img', { name: 'ClawMaster static logo' })).toHaveAttribute('src', '/logo.svg')
  })
})
