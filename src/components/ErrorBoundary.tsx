import { Component, ErrorInfo, ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    errorInfo: null
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo })
  }

  private buildReport() {
    return {
      message: this.state.error?.message ?? 'Unknown UI error',
      stack: this.state.error?.stack ?? null,
      componentStack: this.state.errorInfo?.componentStack ?? null,
      userAgent: navigator.userAgent,
      at: new Date().toISOString()
    }
  }

  private async copyReport() {
    await navigator.clipboard.writeText(JSON.stringify(this.buildReport(), null, 2))
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="app-shell">
        <section className="card" role="alert">
          <h1>Something went wrong.</h1>
          <p>The UI crashed. You can copy a report or reload the app.</p>
          <div className="actions-grid" role="group" aria-label="error-actions">
            <button type="button" onClick={() => { void this.copyReport() }}>Copy report</button>
            <button type="button" onClick={() => window.location.reload()}>Reload app</button>
          </div>
        </section>
      </main>
    )
  }
}
