import { useCallback, useEffect, useState } from 'react'

// The HUD theme preference. "system" follows the device's prefers-color-scheme.
// The same computation runs before the first paint in an inline script in index.html (avoids a flash).
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'gandalf-theme'
const query = '(prefers-color-scheme: dark)'

function readPreference(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // localStorage may be blocked; follow the system.
  }
  return 'system'
}

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia?.(query).matches ? 'dark' : 'light'
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = resolve(theme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readPreference)

  useEffect(() => {
    apply(theme)
    if (theme !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // no persistence; the theme only applies to this tab.
    }
    setThemeState(next)
  }, [])

  return { theme, setTheme, effective: resolve(theme) }
}
