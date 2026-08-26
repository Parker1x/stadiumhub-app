import React from 'react'

// One broken tab must never white-screen the whole app. This boundary catches
// render errors inside a view, shows what happened, and keeps the rest alive.
export default class ErrorBoundary extends React.Component {
  constructor (props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError (error) { return { error } }
  render () {
    if (!this.state.error) return this.props.children
    return (
      <section className="view">
        <div className="empty">
          <strong>This section hit a snag</strong>
          <code style={{ display: 'block', margin: '8px 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.message || this.state.error)}
          </code>
          <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      </section>
    )
  }
}
