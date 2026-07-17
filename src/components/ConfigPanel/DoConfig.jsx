import { DO_MODE } from '../../constants/primitives'
import { outcomeDatapointName } from '../../utils/slug'
import { PlusIcon, TrashIcon } from '../icons'

const MODE_LABEL = {
  [DO_MODE.ACTION]: 'Action',
  [DO_MODE.SUBPROCEDURE]: 'Sub-procedure',
  [DO_MODE.ESCALATE]: 'Escalate',
  [DO_MODE.FINISH]: 'Finish',
}

export default function DoConfig({ node, config, onUpdateConfig }) {
  return (
    <>
      <div className="field-group">
        <label className="field-label">Mode</label>
        <div className="segmented segmented--wrap">
          {Object.values(DO_MODE).map((m) => {
            const semantic = m === DO_MODE.ESCALATE ? 'danger' : m === DO_MODE.FINISH ? 'success' : ''
            const active = config.mode === m
            return (
              <button
                key={m}
                className={`segmented__opt ${active ? 'segmented__opt--active' : ''} ${active && semantic ? `segmented__opt--${semantic}` : ''}`}
                onClick={() => onUpdateConfig({ mode: m })}
              >
                {MODE_LABEL[m]}
              </button>
            )
          })}
        </div>
      </div>

      {config.mode === DO_MODE.ACTION && <ActionMode node={node} config={config} onUpdateConfig={onUpdateConfig} />}
      {config.mode === DO_MODE.SUBPROCEDURE && <SubprocedureMode config={config} onUpdateConfig={onUpdateConfig} />}
      {config.mode === DO_MODE.ESCALATE && (
        <div className="field-group">
          <label className="field-label">Hand-off note</label>
          <textarea
            rows={3}
            value={config.escalate.note}
            onChange={(e) => onUpdateConfig({ escalate: { ...config.escalate, note: e.target.value } })}
          />
        </div>
      )}
      {config.mode === DO_MODE.FINISH && (
        <div className="field-group">
          <label className="field-label">Exit note</label>
          <textarea
            rows={3}
            value={config.finish.note}
            onChange={(e) => onUpdateConfig({ finish: { ...config.finish, note: e.target.value } })}
          />
        </div>
      )}
    </>
  )
}

function ActionMode({ node, config, onUpdateConfig }) {
  const actions = config.actions || []

  function setActions(next) {
    onUpdateConfig({ actions: next })
  }
  function updateAction(i, patch) {
    setActions(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }
  function addAction() {
    setActions([...actions, { name: 'new_action', params: [{ key: 'param', value: 'value' }], mockOutputs: [] }])
  }
  function removeAction(i) {
    setActions(actions.filter((_, idx) => idx !== i))
  }

  return (
    <div className="field-group">
      <label className="field-label">Actions {actions.length > 1 && <span className="field-label__hint">(bundled — run in sequence)</span>}</label>
      <div className="action-list">
        {actions.map((action, i) => (
          <div className="action-card" key={i}>
            <div className="action-card__head">
              <span className="action-card__index">{i + 1}</span>
              <input
                className="field-mono action-card__name"
                value={action.name}
                onChange={(e) => updateAction(i, { name: e.target.value })}
                placeholder="action_name"
              />
              {actions.length > 1 && (
                <button className="branch-row__icon-btn" onClick={() => removeAction(i)} title="Remove action">
                  <TrashIcon />
                </button>
              )}
            </div>

            <ParamRows
              label="Params"
              rows={action.params}
              onChange={(rows) => updateAction(i, { params: rows })}
              keyField="key"
              valueField="value"
              addLabel="Add param"
              placeholderKey="param"
              placeholderValue="value"
            />
            <ParamRows
              label="Mocked outputs (optional)"
              rows={action.mockOutputs || []}
              onChange={(rows) => updateAction(i, { mockOutputs: rows })}
              keyField="datapoint"
              valueField="value"
              addLabel="Add mocked output"
              placeholderKey="datapoint"
              placeholderValue="mock value"
            />
          </div>
        ))}
      </div>
      <button className="add-row-btn" onClick={addAction}>
        <PlusIcon /> Add action to bundle
      </button>

      <OutcomesEditor node={node} config={config} onUpdateConfig={onUpdateConfig} />
    </div>
  )
}

function OutcomesEditor({ node, config, onUpdateConfig }) {
  const outcomes = config.outcomes || []

  function setOutcomes(next) {
    const patch = { outcomes: next }
    if (!next.includes(config.mockOutcome)) patch.mockOutcome = next[0] || ''
    onUpdateConfig(patch)
  }
  function updateOutcome(i, value) {
    setOutcomes(outcomes.map((o, idx) => (idx === i ? value : o)))
  }
  function addOutcome() {
    setOutcomes([...outcomes, `outcome_${outcomes.length + 1}`])
  }
  function removeOutcome(i) {
    setOutcomes(outcomes.filter((_, idx) => idx !== i))
  }

  return (
    <div className="field-group outcomes-editor">
      <label className="field-label">
        Outcomes <span className="field-label__hint">(optional — only needed if a downstream If/Branch reads this node's result)</span>
      </label>
      <p className="field-hint">
        Named outcomes this action can produce. A downstream If/Branch node can pick from this list instead of
        typing a free-text condition
        {node && outcomes.length > 0 && (
          <>
            {' '}
            — written to <code className="cap-node__mono cap-node__mono--small">{outcomeDatapointName(node.data.label)}</code>.
          </>
        )}
      </p>
      <div className="branch-list">
        {outcomes.map((o, i) => (
          <div className="branch-row" key={i}>
            <span className="branch-row__dot" />
            <input className="field-mono" value={o} onChange={(e) => updateOutcome(i, e.target.value)} placeholder="outcome label" />
            <button className="branch-row__icon-btn" onClick={() => removeOutcome(i)} title="Remove outcome">
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      <button className="add-row-btn add-row-btn--small" onClick={addOutcome}>
        <PlusIcon /> Add outcome
      </button>

      {outcomes.length > 0 && (
        <div className="field-group">
          <label className="field-label">Mock outcome for trace</label>
          <select value={config.mockOutcome || outcomes[0]} onChange={(e) => onUpdateConfig({ mockOutcome: e.target.value })}>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function SubprocedureMode({ config, onUpdateConfig }) {
  const sub = config.subprocedure

  function updateSub(patch) {
    onUpdateConfig({ subprocedure: { ...sub, ...patch } })
  }

  return (
    <>
      <div className="field-group">
        <label className="field-label">Sub-procedure</label>
        <input
          className="field-mono"
          value={sub.name}
          onChange={(e) => updateSub({ name: e.target.value })}
          placeholder="sub_procedure_name"
        />
      </div>

      <BindingRows
        label="Input bindings"
        hint="Parent datapoint → sub-procedure input param"
        rows={sub.inputBindings}
        leftField="parentDatapoint"
        rightField="paramName"
        leftPlaceholder="parent_datapoint"
        rightPlaceholder="input_param"
        onChange={(rows) => updateSub({ inputBindings: rows })}
        addLabel="Add input binding"
      />
      <BindingRows
        label="Output bindings"
        hint="Sub-procedure output → parent datapoint"
        rows={sub.outputBindings}
        leftField="outputName"
        rightField="parentDatapoint"
        leftPlaceholder="output_name"
        rightPlaceholder="parent_datapoint"
        onChange={(rows) => updateSub({ outputBindings: rows })}
        addLabel="Add output binding"
      />
    </>
  )
}

function ParamRows({ label, rows, onChange, keyField, valueField, addLabel, placeholderKey, placeholderValue }) {
  function update(i, patch) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function add() {
    onChange([...rows, { [keyField]: '', [valueField]: '' }])
  }
  function remove(i) {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div className="param-block">
      <div className="param-block__label">{label}</div>
      {rows.map((r, i) => (
        <div className="param-row" key={i}>
          <input
            className="field-mono"
            value={r[keyField]}
            onChange={(e) => update(i, { [keyField]: e.target.value })}
            placeholder={placeholderKey}
          />
          <span className="param-row__sep">=</span>
          <input
            className="field-mono"
            value={r[valueField]}
            onChange={(e) => update(i, { [valueField]: e.target.value })}
            placeholder={placeholderValue}
          />
          <button className="branch-row__icon-btn" onClick={() => remove(i)} title="Remove">
            <TrashIcon />
          </button>
        </div>
      ))}
      <button className="add-row-btn add-row-btn--small" onClick={add}>
        <PlusIcon /> {addLabel}
      </button>
    </div>
  )
}

function BindingRows({ label, hint, rows, leftField, rightField, leftPlaceholder, rightPlaceholder, onChange, addLabel }) {
  function update(i, patch) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function add() {
    onChange([...rows, { [leftField]: '', [rightField]: '' }])
  }
  function remove(i) {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      <p className="field-hint">{hint}</p>
      {rows.map((r, i) => (
        <div className="param-row" key={i}>
          <input
            className="field-mono"
            value={r[leftField]}
            onChange={(e) => update(i, { [leftField]: e.target.value })}
            placeholder={leftPlaceholder}
          />
          <span className="param-row__sep">→</span>
          <input
            className="field-mono"
            value={r[rightField]}
            onChange={(e) => update(i, { [rightField]: e.target.value })}
            placeholder={rightPlaceholder}
          />
          <button className="branch-row__icon-btn" onClick={() => remove(i)} title="Remove">
            <TrashIcon />
          </button>
        </div>
      ))}
      <button className="add-row-btn add-row-btn--small" onClick={add}>
        <PlusIcon /> {addLabel}
      </button>
    </div>
  )
}
