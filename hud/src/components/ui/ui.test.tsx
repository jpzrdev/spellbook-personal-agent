import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  Checkbox,
  Dropdown,
  Input,
  Modal,
  Orb,
  ProgressBar,
  Tabs,
  TierBadge,
  ToastProvider,
  Toggle,
  useToast,
} from '.'

describe('Button', () => {
  it('aplica a cor da variante e dispara onClick', async () => {
    const onClick = vi.fn()
    render(
      <Button variante="primario" onClick={onClick}>
        Executar
      </Button>,
    )
    const botao = screen.getByRole('button', { name: 'Executar' })
    expect(botao).toHaveClass('text-musgo-texto', 'bg-pergaminho', 'rounded-controle', 'shadow-relevo-sm')
    await userEvent.click(botao)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('não dispara quando desabilitado', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('TierBadge', () => {
  it.each([
    [1, 'bg-serie-1/20'],
    [2, 'bg-serie-2/25'],
    [3, 'bg-serie-3/20'],
  ] as const)('tier %i usa %s', (tier, classe) => {
    render(<TierBadge tier={tier} />)
    expect(screen.getByText(new RegExp(`^T${tier}`))).toHaveClass(classe)
  })
})

describe('Tabs', () => {
  function Exemplo() {
    const [valor, setValor] = useState('a')
    return (
      <Tabs
        rotulo="abas"
        valor={valor}
        onChange={setValor}
        itens={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
      />
    )
  }

  it('troca com clique e com as setas', async () => {
    render(<Exemplo />)
    const [a, b] = screen.getAllByRole('tab')
    expect(a).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(b)
    expect(b).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(a).toHaveAttribute('aria-selected', 'true')
    expect(a).toHaveFocus()
  })
})

describe('Toggle e Checkbox', () => {
  it('Toggle expõe role switch com aria-checked', async () => {
    const onChange = vi.fn()
    render(<Toggle ligado={false} onChange={onChange} rotulo="Rotina ativa" />)
    const sw = screen.getByRole('switch', { name: 'Rotina ativa' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Checkbox marca pelo rótulo', async () => {
    render(<Checkbox rotulo="Lista 3" />)
    const cb = screen.getByRole('checkbox', { name: 'Lista 3' })
    await userEvent.click(screen.getByText('Lista 3'))
    expect(cb).toBeChecked()
  })
})

describe('Input', () => {
  it('liga rótulo e mensagem de erro', () => {
    render(<Input rotulo="Data" erro="Data inválida" />)
    const campo = screen.getByLabelText('Data')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Data inválida')
  })
})

describe('Dropdown', () => {
  it('abre, seleciona item e fecha; Esc também fecha', async () => {
    const onSelect = vi.fn()
    render(<Dropdown rotulo="Ações" itens={[{ id: 'x', label: 'Rodar', onSelect }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rodar' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ações' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('foca o primeiro campo e fecha com Esc', async () => {
    const onClose = vi.fn()
    render(
      <Modal aberto onClose={onClose} titulo="Nova rotina">
        <Input rotulo="Nome" />
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Nova rotina' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('não renderiza fechado', () => {
    render(
      <Modal aberto={false} onClose={() => {}} titulo="X">
        y
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('limita o valor e expõe aria', () => {
    render(<ProgressBar rotulo="Revisões" valor={150} />)
    expect(screen.getByRole('progressbar', { name: 'Revisões' })).toHaveAttribute('aria-valuenow', '150')
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})

describe('Orb', () => {
  it('muda o rótulo conforme o estado', () => {
    const { rerender } = render(<Orb />)
    expect(screen.getByRole('button', { name: 'Falar com o Gandalf' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<Orb estado="ouvindo" />)
    expect(screen.getByRole('button', { name: /Ouvindo/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Toast', () => {
  function Disparar() {
    const toast = useToast()
    return <button onClick={() => toast('erro', 'Falhou')}>disparar</button>
  }

  it('mostra e some depois do tempo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <ToastProvider duracaoMs={1000}>
        <Disparar />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByText('disparar'))
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou')
    act(() => vi.advanceTimersByTime(1100))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
