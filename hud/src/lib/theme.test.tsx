import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeSelector } from '../components/ThemeSelector'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('cycles system → light → dark, applies it to <html> and saves it', async () => {
    render(<ThemeSelector />)
    expect(screen.getByRole('button', { name: /Theme: system/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('gandalf-theme')).toBe('light')

    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: /Theme: dark/ })).toBeInTheDocument()
  })

  it('reads the saved preference', () => {
    localStorage.setItem('gandalf-theme', 'dark')
    render(<ThemeSelector />)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
