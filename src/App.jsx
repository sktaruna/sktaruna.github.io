import { useCallback, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, applyNodeChanges, applyEdgeChanges, reconnectEdge } from '@xyflow/react'
import { PRIMITIVES } from './primitives/registry'
import { EXAMPLES, DEFAULT_EXAMPLE_KEY } from './graph/examples'
import { createNode, removeNode, updateNodeData, updateNodeConfig, setInlineTarget, addOrReplaceEdge } from './graph/graphOps'
import { layoutTopToBottom } from './graph/autoLayout'
import { findEntryNodeId, draftValueFor, step as traceStep } from './trace/traceEngine'
import CapNode from './components/nodes/CapNode'
import CapEdge from './components/edges/CapEdge'
import EdgeMarkers from './components/edges/EdgeMarkers'
import TopBar from './components/TopBar'
import Palette from './components/Palette'
import ConfigPanel from './components/ConfigPanel/ConfigPanel'
import TracePanel from './components/TracePanel/TracePanel'
import BehaviorChat from './components/BehaviorChat/BehaviorChat'
import './App.css'

const nodeTypes = { capNode: CapNode }
const edgeTypes = { capEdge: CapEdge }

const initialTrace = {
  status: 'idle',
  activeNodeId: null,
  prevActiveNodeId: null,
  datapoints: {},
  draftValue: null,
  attemptCounts: {},
  history: [],
}

function buildInitialGraphsByExample() {
  return Object.fromEntries(EXAMPLES.map((ex) => [ex.key, ex.build()]))
}
function buildInitialMapByExample(value) {
  return Object.fromEntries(EXAMPLES.map((ex) => [ex.key, value]))
}

function describeNode(node) {
  return `${node.id}::${PRIMITIVES[node.data.type].meta.label} — ${node.data.label}`
}

export default function App() {
  const [viewMode, setViewMode] = useState('graph')
  const [exampleKey] = useState(DEFAULT_EXAMPLE_KEY)
  const [graphsByExample, setGraphsByExample] = useState(buildInitialGraphsByExample)
  const [selectionByExample, setSelectionByExample] = useState(() => buildInitialMapByExample(null))
  const [traceByExample, setTraceByExample] = useState(() => buildInitialMapByExample(initialTrace))

  const graph = graphsByExample[exampleKey]
  const { nodes, edges } = graph
  const selectedNodeId = selectionByExample[exampleKey]
  const trace = traceByExample[exampleKey]

  const setSelectedNodeId = useCallback((id) => setSelectionByExample((s) => ({ ...s, [exampleKey]: id })), [exampleKey])
  const setTrace = useCallback(
    (updater) => setTraceByExample((t) => ({ ...t, [exampleKey]: typeof updater === 'function' ? updater(t[exampleKey]) : updater })),
    [exampleKey],
  )
  const setGraph = useCallback(
    (updater) => setGraphsByExample((g) => ({ ...g, [exampleKey]: typeof updater === 'function' ? updater(g[exampleKey]) : updater })),
    [exampleKey],
  )
  const setNodes = useCallback(
    (updater) => setGraph((g) => ({ ...g, nodes: typeof updater === 'function' ? updater(g.nodes) : updater })),
    [setGraph],
  )

  // ---------- Canvas editing ----------

  const onNodesChange = useCallback(
    (changes) => {
      const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id)
      setGraph((g) => {
        let nextNodes = applyNodeChanges(changes, g.nodes)
        let nextEdges = g.edges
        if (removedIds.length) {
          nextNodes = nextNodes.map((n) => {
            const spec = PRIMITIVES[n.data.type]
            return spec?.canvas.inlineTarget && removedIds.includes(n.data.config.target)
              ? { ...n, data: { ...n.data, config: { ...n.data.config, target: null } } }
              : n
          })
          nextEdges = nextEdges.filter((e) => !removedIds.includes(e.source) && !removedIds.includes(e.target))
        }
        return { nodes: nextNodes, edges: nextEdges }
      })
      if (removedIds.length && removedIds.includes(selectedNodeId)) setSelectedNodeId(null)
    },
    [selectedNodeId, setGraph, setSelectedNodeId],
  )

  const onEdgesChange = useCallback(
    (changes) => setGraph((g) => ({ ...g, edges: applyEdgeChanges(changes, g.edges) })),
    [setGraph],
  )

  const onConnect = useCallback(
    (connection) => {
      setGraph((g) => {
        const sourceNode = g.nodes.find((n) => n.id === connection.source)
        if (!sourceNode) return g
        const spec = PRIMITIVES[sourceNode.data.type]
        if (spec?.canvas.inlineTarget) {
          const r = setInlineTarget(g.nodes, g.edges, connection.source, connection.target)
          return r
        }
        return { nodes: g.nodes, edges: addOrReplaceEdge(g.edges, connection) }
      })
    },
    [setGraph],
  )

  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      setGraph((g) => {
        if (oldEdge.data?.isInlineTarget) {
          return setInlineTarget(g.nodes, g.edges, oldEdge.source, newConnection.target)
        }
        return { nodes: g.nodes, edges: reconnectEdge(oldEdge, newConnection, g.edges) }
      })
    },
    [setGraph],
  )

  const onNodeClick = useCallback((_evt, node) => setSelectedNodeId(node.id), [setSelectedNodeId])
  const onPaneClick = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId])

  const handleAddNode = useCallback(
    (type) => {
      setGraph((g) => {
        const count = g.nodes.length
        const position = { x: 120 + ((count * 60) % 900), y: 60 + Math.floor((count * 60) / 900) * 160 }
        const node = createNode(type, position)
        setSelectedNodeId(node.id)
        return { nodes: [...g.nodes, node], edges: g.edges }
      })
    },
    [setGraph, setSelectedNodeId],
  )

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null

  const reactFlowRef = useRef(null)
  const handleTidyLayout = useCallback(() => {
    const measuredNodes = reactFlowRef.current?.getNodes() || nodes
    setNodes((nds) => {
      const laidOut = layoutTopToBottom(measuredNodes, edges)
      const positionById = new Map(laidOut.map((n) => [n.id, n.position]))
      return nds.map((n) => (positionById.has(n.id) ? { ...n, position: positionById.get(n.id) } : n))
    })
    requestAnimationFrame(() => reactFlowRef.current?.fitView({ padding: 0.25 }))
  }, [nodes, edges, setNodes])

  // ---------- Trace execution ----------

  const handleStart = useCallback(() => {
    const entryId = findEntryNodeId(nodes)
    const entryNode = nodes.find((n) => n.id === entryId)
    if (!entryNode) return
    setTrace({
      status: 'running',
      activeNodeId: entryId,
      prevActiveNodeId: null,
      datapoints: { ...(graph.initialDatapoints || {}) },
      draftValue: draftValueFor(entryNode),
      attemptCounts: {},
      history: [describeNode(entryNode)],
    })
  }, [nodes, graph, setTrace])

  const handleReset = useCallback(() => setTrace(initialTrace), [setTrace])

  const handleStep = useCallback(async () => {
    if (trace.status !== 'running') return
    const activeNode = nodes.find((n) => n.id === trace.activeNodeId)
    if (!activeNode) return

    const result = await traceStep({
      node: activeNode,
      nodes,
      edges,
      datapoints: trace.datapoints,
      draftValue: trace.draftValue,
      attemptCounts: trace.attemptCounts,
    })

    setTrace((t) => {
      const next = { ...t, ...result }
      if (result.activeNodeId && result.activeNodeId !== t.activeNodeId) {
        const landedOn = nodes.find((n) => n.id === result.activeNodeId)
        if (landedOn) next.history = [...t.history, describeNode(landedOn)]
      }
      return next
    })
  }, [trace, nodes, edges, setTrace])

  const handleDraftChange = useCallback((val) => setTrace((t) => ({ ...t, draftValue: val })), [setTrace])

  const handleEditDatapoint = useCallback(
    (key, value) => setTrace((t) => ({ ...t, datapoints: { ...t.datapoints, [key]: value } })),
    [setTrace],
  )

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId) return
    setGraph((g) => removeNode(g.nodes, g.edges, selectedNodeId))
    setSelectedNodeId(null)
  }, [selectedNodeId, setGraph, setSelectedNodeId])

  // ---------- Render-time enrichment ----------

  const renderedNodes = useMemo(
    () =>
      nodes.map((n) => {
        const isActive = trace.status !== 'idle' && n.id === trace.activeNodeId
        const isTraced = trace.history?.some((h) => h.startsWith(n.id + '::'))
        const data = { ...n.data, isActive, isTraced }
        const spec = PRIMITIVES[n.data.type]
        if (spec?.canvas.inlineTarget && n.data.config.target) {
          const target = nodes.find((t) => t.id === n.data.config.target)
          data.targetLabel = target?.data.label
        }
        // Every node shows where each of its outgoing handles currently
        // routes to (or "not connected"), and a compact list of what feeds
        // into it — so a freshly-added, unwired node isn't a dead-looking
        // box with no clue where it can go or what leads into it.
        if (spec && !spec.canvas.inlineTarget) {
          const handles = spec.next({ config: n.data.config }).handles || []
          data.routesOut = handles.map((h) => {
            const edge = edges.find((e) => e.source === n.id && e.sourceHandle === h.id)
            const target = edge ? nodes.find((t) => t.id === edge.target) : null
            return { id: h.id, label: h.labelFn ? h.labelFn() : h.id, targetLabel: target?.data.label || null }
          })
        }
        const incomingEdges = edges.filter((e) => e.target === n.id)
        if (incomingEdges.length) {
          data.routesIn = incomingEdges.map((e) => {
            const source = nodes.find((s) => s.id === e.source)
            return source?.data.label || e.source
          })
        }
        return { ...n, data, selected: n.id === selectedNodeId }
      }),
    [nodes, edges, selectedNodeId, trace],
  )

  const renderedEdges = useMemo(
    () =>
      edges.map((e) => {
        const isDefaultish = e.sourceHandle === 'else' || e.sourceHandle === 'onError'
        const conditionLabel = e.sourceHandle && e.sourceHandle !== 'out' && e.sourceHandle !== 'target' ? e.sourceHandle : null
        const isActive = trace.status !== 'idle' && trace.prevActiveNodeId === e.source && trace.activeNodeId === e.target
        return { ...e, data: { ...e.data, conditionLabel, isDefault: isDefaultish, isActive }, reconnectable: true }
      }),
    [edges, trace],
  )

  const activeNode = nodes.find((n) => n.id === trace.activeNodeId) || null

  return (
    <div className="app-shell">
      <TopBar
        status={trace.status}
        onStart={handleStart}
        onStep={handleStep}
        onReset={handleReset}
        onTidyLayout={handleTidyLayout}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {viewMode === 'chat' ? (
        <div className="app-body">
          <BehaviorChat />
        </div>
      ) : (
        <div className="app-body">
          <Palette onAdd={handleAddNode} />
          <div className="canvas-wrap">
            <EdgeMarkers />
            <ReactFlow
              nodes={renderedNodes}
              edges={renderedEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onInit={(instance) => { reactFlowRef.current = instance }}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--grid-dot)" />
            </ReactFlow>
          </div>
          {trace.status === 'idle' ? (
            <ConfigPanel
              node={selectedNode}
              nodes={nodes}
              edges={edges}
              onUpdateLabel={(label) => setNodes((nds) => updateNodeData(nds, selectedNodeId, { label }))}
              onUpdateConfig={(patch) => setNodes((nds) => updateNodeConfig(nds, selectedNodeId, patch))}
              onDelete={handleDeleteSelected}
            />
          ) : (
            <TracePanel
              status={trace.status}
              activeNode={activeNode}
              datapoints={trace.datapoints}
              history={trace.history}
              draftValue={trace.draftValue}
              attemptCounts={trace.attemptCounts}
              onDraftChange={handleDraftChange}
              onEditDatapoint={handleEditDatapoint}
            />
          )}
        </div>
      )}
    </div>
  )
}
