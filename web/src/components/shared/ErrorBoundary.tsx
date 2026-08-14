import { Component, type ReactNode } from 'react'
import { Button } from './ui'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Top-level safety net: without this, any uncaught render-time exception unmounts the whole
// React tree to a blank white page with no indication anything went wrong. This turns that
// into a visible, recoverable message instead.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-500 mb-4">
              This page hit an unexpected error. Try reloading — if it keeps happening, let us know.
            </p>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
