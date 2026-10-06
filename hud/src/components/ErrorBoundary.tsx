import { CircleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, EmptyState } from './ui'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Catches render errors so the screen doesn't go blank. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <EmptyState
        icon={<CircleAlert />}
        color="ember"
        title="Something broke on this screen"
        description={this.state.error.message}
        action={<Button onClick={() => this.setState({ error: null })}>Try again</Button>}
      />
    )
  }
}
