import { useEffect, useRef, useState } from 'react'
import { useBehaviorEngine } from '../../behaviors/engine'
import { RESCHEDULE_FLOW } from '../../behaviors/flow'
import {
  StatusBadge,
  TextBlock,
  ChipGroup,
  KvTable,
  StatusList,
  LoadingIndicator,
  StepTracker,
  ButtonStack,
  ButtonRow,
  InputField,
  RatingScale,
} from './primitives'
import './behaviorChat.css'

function Message({ msg, onPickChip, disabled }) {
  switch (msg.type) {
    case 'agent-text':
      return (
        <div className="bp-msg bp-msg--agent">
          <TextBlock>{msg.text}</TextBlock>
          {msg.hints?.length > 0 && (
            <div className="bp-hints" role="group" aria-label="Hints">
              {msg.hints.map((h) => (
                <span className="bp-hint" key={h}>
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    case 'user':
      return (
        <div className="bp-msg bp-msg--user">
          <TextBlock>{msg.text}</TextBlock>
        </div>
      )
    case 'agent-loading':
      return (
        <div className="bp-msg bp-msg--agent bp-msg--muted">
          <LoadingIndicator message={msg.text} />
        </div>
      )
    case 'agent-result':
      return (
        <div className="bp-msg bp-msg--agent">
          {msg.badge && (
            <div className="bp-msg__badge-row">
              <StatusBadge label={msg.badge.label} state={msg.badge.state} />
            </div>
          )}
          {msg.lines.map((l, i) => (
            <div key={i} className={i === 0 ? 'bp-line-strong' : 'bp-line'}>
              {l}
            </div>
          ))}
        </div>
      )
    case 'agent-badge':
      return (
        <div className="bp-msg bp-msg--agent">
          <StatusBadge label={msg.badge.label} state={msg.badge.state} />
        </div>
      )
    case 'agent-badge-text':
      return (
        <div className="bp-msg bp-msg--agent">
          <div className="bp-msg__badge-row">
            <StatusBadge label={msg.badge.label} state={msg.badge.state} />
          </div>
          <TextBlock>{msg.text}</TextBlock>
          {msg.max && <StepTracker attempt={msg.attempt} max={msg.max} />}
        </div>
      )
    case 'chips':
      return (
        <div className="bp-msg bp-msg--agent bp-msg--bare">
          <ChipGroup options={msg.options} onPick={onPickChip} disabled={disabled} />
        </div>
      )
    case 'status-list':
      return (
        <div className="bp-msg bp-msg--agent bp-msg--bare">
          <StatusList items={msg.items} />
        </div>
      )
    case 'confirm-card':
      return (
        <div className="bp-msg bp-msg--agent">
          <TextBlock>
            <strong>{msg.title}</strong>
          </TextBlock>
          <KvTable rows={msg.rows} />
        </div>
      )
    case 'escalate-card':
      return (
        <div className="bp-msg bp-msg--agent bp-msg--escalate">
          <TextBlock>{msg.reason}</TextBlock>
          {msg.rows.length > 0 && <KvTable rows={msg.rows} />}
        </div>
      )
    case 'done-card':
      return <DoneCard msg={msg} />
    default:
      return null
  }
}

function DoneCard({ msg }) {
  const [rating, setRating] = useState(null)
  return (
    <div className="bp-msg bp-msg--agent bp-msg--done">
      <div className="bp-msg__badge-row">
        <StatusBadge label="Confirmed" state="success" />
      </div>
      <TextBlock>
        <strong>{msg.title}</strong>
        <br />
        {msg.message}
      </TextBlock>
      <KvTable rows={msg.rows} />
      {msg.collectRating && (
        <div className="bp-rating-block">
          <div className="bp-rating-block__label">How was your experience?</div>
          <RatingScale value={rating} onRate={setRating} />
        </div>
      )}
    </div>
  )
}

export default function BehaviorChat() {
  const engine = useBehaviorEngine(RESCHEDULE_FLOW)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [engine.transcript, engine.awaiting])

  useEffect(() => {
    setDraft('')
  }, [engine.awaiting])

  function handlePickChip(value) {
    if (engine.awaiting?.type === 'collect') engine.submitCollect(value)
  }

  return (
    <div className="behavior-chat">
      <div className="behavior-chat__header">
        <div className="behavior-chat__avatar">AI</div>
        <div>
          <div className="behavior-chat__name">Delivery Assistant</div>
          <div className="behavior-chat__status">
            {engine.status === 'running' && !engine.awaiting ? 'Typing…' : engine.status === 'finished' ? 'Finished' : 'Online'}
          </div>
        </div>
      </div>

      <div className="behavior-chat__body" ref={scrollRef}>
        {engine.status === 'idle' && (
          <div className="bp-empty">
            <p>An 11-behavior dummy conversation — real collect/branch/loop logic, not a scripted replay.</p>
          </div>
        )}
        {engine.transcript.map((msg) => (
          <Message key={msg.id} msg={msg} onPickChip={handlePickChip} disabled={engine.awaiting?.type !== 'collect'} />
        ))}
      </div>

      <div className="behavior-chat__composer">
        {engine.status === 'idle' && (
          <button className="bp-btn bp-btn--primary bp-btn--block" onClick={engine.start}>
            ▶ Start Conversation
          </button>
        )}

        {engine.awaiting?.type === 'collect' && (
          <InputField
            value={draft}
            onChange={setDraft}
            onSubmit={engine.submitCollect}
            placeholder={engine.awaiting.field.placeholder}
            autoFocus
          />
        )}

        {engine.awaiting?.type === 'choice' && <ButtonStack options={engine.awaiting.options} onChoose={engine.chooseOption} />}

        {engine.awaiting?.type === 'confirm' && <ButtonRow actions={engine.awaiting.actions} onAct={engine.confirmAction} />}

        {engine.status === 'finished' && (
          <button className="bp-btn bp-btn--outline bp-btn--block" onClick={engine.start}>
            ↺ Start Over
          </button>
        )}
      </div>
    </div>
  )
}
