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
  it('applies the variant color and fires onClick', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" onClick={onClick}>
        Run
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Run' })
    expect(button).toHaveClass('text-primary-text', 'bg-surface', 'rounded-control', 'shadow-raised-sm')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("doesn't fire when disabled", async () => {
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
    [1, 'bg-series-1/20'],
    [2, 'bg-series-2/25'],
    [3, 'bg-series-3/20'],
  ] as const)('tier %i uses %s', (tier, cls) => {
    render(<TierBadge tier={tier} />)
    expect(screen.getByText(new RegExp(`^T${tier}`))).toHaveClass(cls)
  })
})

describe('Tabs', () => {
  function Example() {
    const [value, setValue] = useState('a')
    return (
      <Tabs
        label="tabs"
        value={value}
        onChange={setValue}
        items={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
      />
    )
  }

  it('switches on click and with the arrow keys', async () => {
    render(<Example />)
    const [a, b] = screen.getAllByRole('tab')
    expect(a).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(b)
    expect(b).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(a).toHaveAttribute('aria-selected', 'true')
    expect(a).toHaveFocus()
  })
})

describe('Toggle and Checkbox', () => {
  it('Toggle exposes a switch role with aria-checked', async () => {
    const onChange = vi.fn()
    render(<Toggle on={false} onChange={onChange} label="Routine active" />)
    const sw = screen.getByRole('switch', { name: 'Routine active' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Checkbox checks through its label', async () => {
    render(<Checkbox label="Problem set 3" />)
    const cb = screen.getByRole('checkbox', { name: 'Problem set 3' })
    await userEvent.click(screen.getByText('Problem set 3'))
    expect(cb).toBeChecked()
  })
})

describe('Input', () => {
  it('links the label and the error message', () => {
    render(<Input label="Date" error="Invalid date" />)
    const field = screen.getByLabelText('Date')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Invalid date')
  })
})

describe('Dropdown', () => {
  it('opens, selects an item and closes; Esc also closes', async () => {
    const onSelect = vi.fn()
    render(<Dropdown label="Actions" items={[{ id: 'x', label: 'Run', onSelect }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Run' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('focuses the first field and closes with Esc', async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="New routine">
        <Input label="Name" />
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'New routine' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it("doesn't render when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="X">
        y
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('clamps the value and exposes aria', () => {
    render(<ProgressBar label="Reviews" value={150} />)
    expect(screen.getByRole('progressbar', { name: 'Reviews' })).toHaveAttribute('aria-valuenow', '150')
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})

describe('Orb', () => {
  it('changes the label with the state', () => {
    const { rerender } = render(<Orb />)
    expect(screen.getByRole('button', { name: 'Talk to Gandalf' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<Orb state="listening" />)
    expect(screen.getByRole('button', { name: /Listening/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Toast', () => {
  function Trigger() {
    const toast = useToast()
    return <button onClick={() => toast('error', 'It failed')}>trigger</button>
  }

  it('shows up and disappears after the time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <ToastProvider durationMs={1000}>
        <Trigger />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByText('trigger'))
    expect(screen.getByRole('alert')).toHaveTextContent('It failed')
    act(() => vi.advanceTimersByTime(1100))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
