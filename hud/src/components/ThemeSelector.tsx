import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '../lib/theme'
import { Button } from './ui'

const order: Theme[] = ['system', 'light', 'dark']
const icons = { system: Monitor, light: Sun, dark: Moon }

/** A button that cycles the theme: system → light → dark. */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const next = order[(order.indexOf(theme) + 1) % order.length]
  const Icon = icons[theme]
  const label = `Theme: ${theme}. Switch to: ${next}`
  return (
    <Button variant="icon" size="sm" aria-label={label} title={label} onClick={() => setTheme(next)}>
      <Icon className="size-4" aria-hidden />
    </Button>
  )
}
