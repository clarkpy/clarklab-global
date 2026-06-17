import * as React from 'react'
import type { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('Error caught by boundary:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center px-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 max-w-md text-center">
            <h2 className="text-3xl font-black text-white mb-4">Something went wrong</h2>
            <p className="text-sm text-slate-400 mb-6">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="rounded-full bg-violet-600 px-6 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition"
            >
              Return home
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
