import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { SeletorTema } from '../components/SeletorTema'

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('alterna sistema → claro → escuro, aplica no <html> e salva', async () => {
    render(<SeletorTema />)
    expect(screen.getByRole('button', { name: /Tema: sistema/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('claro')
    expect(localStorage.getItem('lifeos-tema')).toBe('claro')

    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('escuro')
    expect(screen.getByRole('button', { name: /Tema: escuro/ })).toBeInTheDocument()
  })

  it('lê a preferência salva', () => {
    localStorage.setItem('lifeos-tema', 'escuro')
    render(<SeletorTema />)
    expect(document.documentElement.dataset.theme).toBe('escuro')
  })
})
