type IntroSplashProps = {
  visible: boolean
  title: string
  body: string
  bullets: string[]
  statusLine: string
  enterLabel: string
  showSpinner: boolean
  onEnter: () => void
}

function IntroSplash({
  visible,
  title,
  body,
  bullets,
  statusLine,
  enterLabel,
  showSpinner,
  onEnter
}: IntroSplashProps) {
  if (!visible) {
    return null
  }

  return (
    <div className="intro-splash" role="dialog" aria-modal="true" aria-live="polite" aria-label={title}>
      <div className="intro-splash__card">
        <h2>{title}</h2>
        <p>{body}</p>
        <ul>
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <p className="status-line">{statusLine}</p>
        <div className="intro-splash__actions">
          {showSpinner ? <span className="spinner" aria-hidden="true" /> : null}
          <button type="button" onClick={onEnter}>{enterLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default IntroSplash
