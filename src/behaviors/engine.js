import { useCallback, useMemo, useRef, useState } from 'react'
import { evaluateCondition } from '../utils/condition'
import { mockApi } from './mockApi'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fill(str, datapoints) {
  if (!str) return str
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (datapoints[k] ?? '').toString())
}

// Interprets an 11-behavior flow (see behaviors/flow.js) step by step,
// pausing at collect/choice/confirm nodes for real user input and resuming
// via the returned submit* callbacks. Everything else (action/if/investigate/
// while/foreach) runs for real against datapoints — no scripted animation.
export function useBehaviorEngine(flow) {
  const nodeMap = useMemo(() => Object.fromEntries(flow.nodes.map((n) => [n.slug, n])), [flow])

  const [transcript, setTranscript] = useState([])
  const [datapoints, setDatapoints] = useState(flow.initialDatapoints || {})
  const [awaiting, setAwaiting] = useState(null)
  const [status, setStatus] = useState('idle') // idle | running | finished

  const resolverRef = useRef(null)
  const runIdRef = useRef(0)

  const pushMessage = useCallback((msg) => {
    setTranscript((t) => [...t, msg])
  }, [])
  const updateMessage = useCallback((id, patch) => {
    setTranscript((t) => t.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  const waitFor = useCallback((spec) => {
    setAwaiting(spec)
    return new Promise((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const respond = useCallback((value) => {
    const resolve = resolverRef.current
    if (!resolve) return
    resolverRef.current = null
    setAwaiting(null)
    resolve(value)
  }, [])

  const start = useCallback(() => {
    runIdRef.current += 1
    const myRunId = runIdRef.current
    setTranscript([])
    setStatus('running')
    setAwaiting(null)

    let dp = { ...(flow.initialDatapoints || {}) }
    setDatapoints(dp)

    let seq = 0
    const nextId = () => `m${myRunId}-${seq++}`
    const stale = () => runIdRef.current !== myRunId

    async function run(startSlug) {
      let slug = startSlug

      while (slug) {
        if (stale()) return
        const node = nodeMap[slug]
        if (!node) {
          setStatus('finished')
          return
        }

        if (node.behavior === 'choice') {
          pushMessage({ id: nextId(), type: 'agent-text', text: node.prompt })
          const choice = await waitFor({ type: 'choice', options: node.options })
          if (stale()) return
          pushMessage({ id: nextId(), type: 'user', text: choice.label })
          slug = choice.goto
          continue
        }

        if (node.behavior === 'collect') {
          pushMessage({ id: nextId(), type: 'agent-text', text: node.prompt, hints: node.hints })
          const value = await waitFor({ type: 'collect', field: node.field })
          if (stale()) return
          dp = { ...dp, [node.field.name]: value }
          setDatapoints(dp)
          pushMessage({ id: nextId(), type: 'user', text: value })
          slug = node.goto
          continue
        }

        if (node.behavior === 'action') {
          const loadingId = nextId()
          pushMessage({ id: loadingId, type: 'agent-loading', text: node.loadingMessage })
          let result
          try {
            result = await mockApi[node.call](dp)
          } catch {
            result = { outcome: 'error', data: {} }
          }
          if (stale()) return
          dp = { ...dp, ...(result.data || {}) }
          setDatapoints(dp)
          const render = node.outcomeRender?.[result.outcome]
          updateMessage(loadingId, {
            type: 'agent-result',
            badge: render?.badge,
            lines: (render?.lines || []).map((l) => fill(l, dp)),
          })
          slug = node.outcomes[result.outcome] || node.outcomes.default
          continue
        }

        if (node.behavior === 'if') {
          const checkId = nextId()
          pushMessage({ id: checkId, type: 'agent-badge', badge: { label: 'Checking', state: 'info' } })
          await delay(550)
          if (stale()) return
          const truthy = evaluateCondition(node.condition, dp)
          const info = truthy ? node.thenInfo : node.elseInfo
          updateMessage(checkId, { type: 'agent-badge-text', badge: info.badge, text: fill(info.text, dp) })
          slug = truthy ? node.then : node.else
          continue
        }

        if (node.behavior === 'investigate') {
          pushMessage({ id: nextId(), type: 'agent-text', text: node.title })
          const listId = nextId()
          let items = node.checks.map((c) => ({ label: c.label, status: 'pending', detail: '' }))
          pushMessage({ id: listId, type: 'status-list', items })
          for (let i = 0; i < node.checks.length; i++) {
            items = items.map((it, idx) => (idx === i ? { ...it, status: 'active', detail: 'Checking...' } : it))
            updateMessage(listId, { items: [...items] })
            const r = await mockApi[node.checks[i].call](dp)
            if (stale()) return
            dp = { ...dp, ...(r.data || {}) }
            setDatapoints(dp)
            items = items.map((it, idx) => (idx === i ? { ...it, status: 'done', detail: r.detail || 'OK' } : it))
            updateMessage(listId, { items: [...items] })
          }
          slug = node.goto
          continue
        }

        if (node.behavior === 'foreach') {
          pushMessage({ id: nextId(), type: 'agent-text', text: node.title })
          const collection = dp[node.collection] || []
          const listId = nextId()
          let items = collection.map((d) => ({ label: d, status: 'pending', detail: '' }))
          pushMessage({ id: listId, type: 'status-list', items })
          const results = []
          for (let i = 0; i < collection.length; i++) {
            items = items.map((it, idx) => (idx === i ? { ...it, status: 'active', detail: 'Checking...' } : it))
            updateMessage(listId, { items: [...items] })
            const r = await mockApi[node.call]({ item: collection[i] })
            if (stale()) return
            items = items.map((it, idx) => (idx === i ? { ...it, status: r.available ? 'done' : 'error', detail: r.detail } : it))
            updateMessage(listId, { items: [...items] })
            if (r.available) results.push(collection[i])
          }
          dp = { ...dp, [node.resultField]: results }
          setDatapoints(dp)
          slug = node.goto
          continue
        }

        if (node.behavior === 'while') {
          let attempt = 0
          while (true) {
            if (attempt > 0) {
              pushMessage({
                id: nextId(),
                type: 'agent-badge-text',
                badge: { label: 'Invalid Entry', state: 'error' },
                text: node.invalidMessage,
                attempt,
                max: node.maxIterations,
              })
              pushMessage({ id: nextId(), type: 'chips', options: dp[node.chipsField] || [] })
            } else {
              pushMessage({ id: nextId(), type: 'agent-text', text: node.firstPrompt })
              if (dp[node.chipsField]?.length) pushMessage({ id: nextId(), type: 'chips', options: dp[node.chipsField] })
            }
            const value = await waitFor({ type: 'collect', field: node.collectField })
            if (stale()) return
            dp = { ...dp, [node.collectField.name]: value }
            setDatapoints(dp)
            pushMessage({ id: nextId(), type: 'user', text: value })
            const ok = evaluateCondition(node.successCondition, dp)
            if (ok) {
              slug = node.successGoto
              break
            }
            attempt++
            if (attempt >= node.maxIterations) {
              slug = node.maxGoto
              break
            }
          }
          continue
        }

        if (node.behavior === 'confirm') {
          pushMessage({
            id: nextId(),
            type: 'confirm-card',
            title: node.title,
            rows: node.rows.map((r) => ({ label: r.label, value: r.valueField ? dp[r.valueField] : r.value, highlight: r.highlight })),
          })
          const action = await waitFor({ type: 'confirm', actions: node.actions })
          if (stale()) return
          pushMessage({ id: nextId(), type: 'user', text: action.label })
          slug = action.goto
          continue
        }

        if (node.behavior === 'escalate') {
          pushMessage({
            id: nextId(),
            type: 'escalate-card',
            reason: fill(node.reason, dp),
            rows: (node.rows || []).map((r) => ({ label: r.label, value: r.valueField ? dp[r.valueField] : r.value })),
          })
          if (node.goto) {
            slug = node.goto
            continue
          }
          setStatus('finished')
          return
        }

        if (node.behavior === 'done') {
          pushMessage({
            id: nextId(),
            type: 'done-card',
            title: node.title,
            message: node.message,
            rows: (node.rows || []).map((r) => ({ label: r.label, value: r.valueField ? dp[r.valueField] : r.value, highlight: r.highlight })),
            collectRating: node.collectRating,
          })
          setStatus('finished')
          return
        }

        setStatus('finished')
        return
      }
      setStatus('finished')
    }

    run(flow.entry)
  }, [flow, nodeMap, pushMessage, updateMessage, waitFor])

  const submitCollect = useCallback((value) => respond(value), [respond])
  const chooseOption = useCallback((option) => respond(option), [respond])
  const confirmAction = useCallback((action) => respond(action), [respond])

  return { transcript, datapoints, awaiting, status, start, submitCollect, chooseOption, confirmAction }
}
