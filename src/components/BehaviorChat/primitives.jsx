// The 11 UI primitives from primitive_expansion_plan.md, as real React
// components — status-badge, chip-group, and rating-scale (the 3 additions)
// plus the original 8 (text-block, input-field, button-row, button-stack,
// kv-table, status-list, step-tracker, loading-indicator).

export function StatusBadge({ label, state = 'info' }) {
  return (
    <span className={`bp-badge bp-badge--${state}`} role="status">
      {label}
    </span>
  )
}

export function TextBlock({ children }) {
  return <div className="bp-text">{children}</div>
}

export function ChipGroup({ options, onPick, disabled }) {
  return (
    <div className="bp-chips" role="group" aria-label="Suggestions">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className="bp-chip"
          disabled={disabled}
          onClick={() => onPick(opt)}
          aria-label={`Fill in ${opt}`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export function KvTable({ rows }) {
  return (
    <div className="bp-kv" role="table">
      {rows.map((r) => (
        <div className="bp-kv__row" key={r.label} role="row">
          <span className="bp-kv__label">{r.label}</span>
          <span className={`bp-kv__value ${r.highlight ? 'bp-kv__value--highlight' : ''}`}>{r.value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

export function StatusList({ items }) {
  const stateOf = (status) => (status === 'done' ? 'success' : status === 'error' ? 'error' : status === 'active' ? 'info' : 'pending')
  const labelOf = (status) => (status === 'done' ? 'Done' : status === 'error' ? 'Unavailable' : status === 'active' ? 'Checking' : 'Waiting')
  return (
    <div className="bp-status-list" role="list">
      {items.map((it) => (
        <div className={`bp-status-list__row bp-status-list__row--${it.status}`} key={it.label} role="listitem" aria-live="polite">
          <div className="bp-status-list__main">
            <div className="bp-status-list__label">{it.label}</div>
            {it.detail && <div className="bp-status-list__detail">{it.detail}</div>}
          </div>
          <StatusBadge label={labelOf(it.status)} state={stateOf(it.status)} />
        </div>
      ))}
    </div>
  )
}

export function LoadingIndicator({ message }) {
  return (
    <div className="bp-loading" role="progressbar" aria-busy="true" aria-label={message}>
      <span className="bp-loading__dots">
        <span />
        <span />
        <span />
      </span>
      <span className="bp-loading__text">{message}</span>
    </div>
  )
}

export function StepTracker({ attempt, max }) {
  if (!max) return null
  return (
    <div className="bp-step-tracker" role="progressbar" aria-valuenow={attempt} aria-valuemin={1} aria-valuemax={max}>
      <div className="bp-step-tracker__bar">
        <div className="bp-step-tracker__fill" style={{ width: `${(attempt / max) * 100}%` }} />
      </div>
      <span className="bp-step-tracker__label">
        Attempt {attempt} of {max}
      </span>
    </div>
  )
}

export function ButtonStack({ options, onChoose }) {
  return (
    <div className="bp-button-stack" role="group" aria-label="Choose an option">
      {options.map((opt) => (
        <button key={opt.label} type="button" className="bp-option-btn" onClick={() => onChoose(opt)}>
          <div className="bp-option-btn__title">{opt.label}</div>
          {opt.subtitle && <div className="bp-option-btn__subtitle">{opt.subtitle}</div>}
        </button>
      ))}
    </div>
  )
}

export function ButtonRow({ actions, onAct }) {
  return (
    <div className="bp-button-row" role="group" aria-label="Actions">
      {actions.map((a) => (
        <button key={a.label} type="button" className={`bp-btn bp-btn--${a.style || 'default'}`} onClick={() => onAct(a)}>
          {a.label}
        </button>
      ))}
    </div>
  )
}

export function InputField({ value, onChange, onSubmit, placeholder, autoFocus }) {
  return (
    <form
      className="bp-input-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <input
        className="bp-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <button type="submit" className="bp-btn bp-btn--primary">
        Go
      </button>
    </form>
  )
}

export function RatingScale({ value, onRate }) {
  const points = [
    { v: 1, emoji: '😞', label: 'Very dissatisfied' },
    { v: 2, emoji: '😐', label: 'Dissatisfied' },
    { v: 3, emoji: '🙂', label: 'Satisfied' },
    { v: 4, emoji: '😍', label: 'Very satisfied' },
  ]
  return (
    <div className="bp-rating" role="radiogroup" aria-label="Rate your experience">
      {points.map((p) => (
        <button
          key={p.v}
          type="button"
          role="radio"
          aria-checked={value === p.v}
          aria-label={p.label}
          className="bp-rating__btn"
          onClick={() => onRate(p.v)}
        >
          {p.emoji}
        </button>
      ))}
    </div>
  )
}
