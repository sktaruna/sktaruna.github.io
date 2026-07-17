import ExampleSwitcher from './ExampleSwitcher'
import './topBar.css'

const STATUS_LABEL = {
  idle: 'Idle',
  running: 'Running',
  complete: 'Flow complete',
  escalated: 'Escalated',
}

export default function TopBar({ status, onStart, onStep, onReset, activeExampleKey, onExampleChange, viewMode, onViewModeChange }) {
  const running = status !== 'idle'
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__mark" />
        <div>
          <div className="top-bar__title">Capability Graph Editor</div>
          <div className="top-bar__subtitle">6-primitive deterministic interpreter — prototype</div>
        </div>
      </div>

      <div className="top-bar__mode-switch" role="group" aria-label="View mode">
        <button
          className={`top-bar__mode-btn ${viewMode === 'graph' ? 'top-bar__mode-btn--active' : ''}`}
          onClick={() => onViewModeChange('graph')}
        >
          Graph Editor
        </button>
        <button
          className={`top-bar__mode-btn ${viewMode === 'chat' ? 'top-bar__mode-btn--active' : ''}`}
          onClick={() => onViewModeChange('chat')}
        >
          Agent Behavior Demo
        </button>
      </div>

      {viewMode === 'graph' && <ExampleSwitcher activeKey={activeExampleKey} onChange={onExampleChange} />}

      {viewMode === 'graph' && <div className="top-bar__controls">
        <span className={`top-bar__status top-bar__status--${status}`}>
          <span className="top-bar__status-dot" />
          {STATUS_LABEL[status]}
        </span>
        {!running ? (
          <button className="top-bar__btn top-bar__btn--primary" onClick={onStart}>
            ▶ Run
          </button>
        ) : (
          <button
            className="top-bar__btn top-bar__btn--primary"
            onClick={onStep}
            disabled={status === 'complete' || status === 'escalated'}
          >
            Step forward →
          </button>
        )}
        <button className="top-bar__btn" onClick={onReset} disabled={status === 'idle'}>
          ↺ Reset
        </button>
      </div>}
    </header>
  )
}
