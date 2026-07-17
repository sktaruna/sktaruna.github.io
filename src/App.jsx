import { useCallback, useMemo, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, applyNodeChanges, applyEdgeChanges, reconnectEdge } from '@xyflow/react'
import { PRIMITIVE, PRIMITIVE_META } from './constants/primitives'
import { EXAMPLES, DEFAULT_EXAMPLE_KEY } from './graph/examples'
import {
  createNode,
  removeNode,
  updateNodeData,
  updateNodeConfig,
  addBranch,
  removeBranch,
  updateBranch,
  syncGotoEdge,
  addOrReplaceEdge,
} from './graph/graphOps'
import { findEntryNodeId, resolveOutcome, mockAskPlaceholder, computeSetValue, applyDoEffects } from './trace/traceEngine'
import CapNode from './components/nodes/CapNode'
import CapEdge from './components/edges/CapEdge'
import EdgeMarkers from './components/edges/EdgeMarkers'
import TopBar from './components/TopBar'
import Palette from './components/Palette'
import ConfigPanel from './components/ConfigPanel/ConfigPanel'
import TracePanel from './components/TracePanel/TracePanel'
import './App.css'

const nodeTypes = { capNode: CapNode }
const edgeTypes = { capEdge: CapEdge }

const initialTrace = { status: 'idle', activeNodeId: null, prevActiveNodeId: null, datapoints: {}, askDraft: '', history: [] }

function buildInitialGraphsByExample() {
  return Object.fromEntries(EXAMPLES.map((ex) => [ex.key, ex.build()]))
}
function buildInitialMapByExample(value) {
  return Object.fromEntries(EXAMPLES.map((ex) => [ex.key, value]))
}

export default function App() {
  const [exampleKey, setExampleKey] = useState(DEFAULT_EXAMPLE_KEY)
  const [graphsByExample, setGraphsByExample] = useState(buildInitialGraphsByExample)
  const [selectionByExample, setSelectionByExample] = useState(() => buildInitialMapByExample(null))
  const [traceByExample, setTraceByExample] = useState(() => buildInitialMapByExample(initialTrace))

  const graph = graphsByExample[exampleKey]
  const { nodes, edges } = graph
  const selectedNodeId = selectionByExample[exampleKey]
  const trace = traceByExample[exampleKey]

  const setSelectedNodeId = useCallback(
    (id) => setSelectionByExample((s) => ({ ...s, [exampleKey]: id })),
    [exampleKey],
  )
  const setTrace = useCallback(
    (updater) =>
      setTraceByExample((t) => ({ ...t, [exampleKey]: typeof updater === 'function' ? updater(t[exampleKey]) : updater })),
    [exampleKey],
  )
  const setGraph = useCallback(
    (updater) =>
      setGraphsByExample((g) => ({ ...g, [exampleKey]: typeof updater === 'function' ? updater(g[exampleKey]) : updater })),
    [exampleKey],
  )
  const setNodes = useCallback((updater) => {
    setGraph((g) => ({ ...g, nodes: typeof updater === 'function' ? updater(g.nodes) : updater }))
  }, [setGraph])

  // ---------- Canvas editing ----------

  const onNodesChange = useCallback(
    (changes) => {
      const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id)
      setGraph((g) => {
        let nextNodes = applyNodeChanges(changes, g.nodes)
        let nextEdges = g.edges
        if (removedIds.length) {
          nextNodes = nextNodes.map((n) =>
            n.data.primitive === PRIMITIVE.GOTO && removedIds.includes(n.data.config.targetId)
              ? { ...n, data: { ...n.data, config: { ...n.data.config, targetId: null } } }
              : n,
          )
          nextEdges = nextEdges.filter((e) => !removedIds.includes(e.source) && !removedIds.includes(e.target))
        }
        return { nodes: nextNodes, edges: nextEdges }
      })
      if (removedIds.length && removedIds.includes(selectedNodeId)) setSelectedNodeId(null)
    },
    [selectedNodeId, setGraph, setSelectedNodeId],
  )

  const onEdgesChange = useCallback((changes) => {
    setGraph((g) => ({ ...g, edges: applyEdgeChanges(changes, g.edges) }))
  }, [setGraph])

  const onConnect = useCallback((connection) => {
    setGraph((g) => {
      const sourceNode = g.nodes.find((n) => n.id === connection.source)
      if (!sourceNode) return g
      if (sourceNode.data.primitive === PRIMITIVE.GOTO) {
        return { nodes: updateNodeConfig(g.nodes, connection.source, { targetId: connection.target }), edges: syncGotoEdge(g.nodes, g.edges, connection.source, connection.target) }
      }
      return { nodes: g.nodes, edges: addOrReplaceEdge(g.edges, connection) }
    })
  }, [setGraph])

  const onReconnect = useCallback((oldEdge, newConnection) => {
    setGraph((g) => {
      if (oldEdge.data?.isGoto) {
        return {
          nodes: updateNodeConfig(g.nodes, oldEdge.source, { targetId: newConnection.target }),
          edges: syncGotoEdge(g.nodes, g.edges, oldEdge.source, newConnection.target),
        }
      }
      return { nodes: g.nodes, edges: reconnectEdge(oldEdge, newConnection, g.edges) }
    })
  }, [setGraph])

  const onNodeClick = useCallback((_evt, node) => setSelectedNodeId(node.id), [setSelectedNodeId])
  const onPaneClick = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId])

  const handleAddNode = useCallback((primitive) => {
    setGraph((g) => {
      const count = g.nodes.length
      const position = { x: 120 + ((count * 60) % 900), y: 60 + Math.floor((count * 60) / 900) * 160 }
      const node = createNode(primitive, position)
      setSelectedNodeId(node.id)
      return { nodes: [...g.nodes, node], edges: g.edges }
    })
  }, [setGraph, setSelectedNodeId])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null

  const configGraphOps = useMemo(() => {
    if (!selectedNode) return null
    const id = selectedNode.id
    return {
      addBranch: () => setNodes((nds) => addBranch(nds, id)),
      removeBranch: (branchId) =>
        setGraph((g) => {
          const r = removeBranch(g.nodes, g.edges, id, branchId)
          return { nodes: r.nodes, edges: r.edges }
        }),
      updateBranch: (branchId, patch) => setNodes((nds) => updateBranch(nds, id, branchId, patch)),
      setGotoTarget: (targetId) =>
        setGraph((g) => ({
          nodes: updateNodeConfig(g.nodes, id, { targetId }),
          edges: syncGotoEdge(g.nodes, g.edges, id, targetId),
        })),
    }
  }, [selectedNode, setNodes, setGraph])

  // ---------- Trace execution ----------

  function enterNode(node, datapointsIn) {
    let datapoints = datapointsIn
    let endStatus = null
    let askDraft = ''

    if (node.data.primitive === PRIMITIVE.SET) {
      datapoints = { ...datapoints, [node.data.config.datapoint]: computeSetValue(node.data.config) }
    } else if (node.data.primitive === PRIMITIVE.DO) {
      datapoints = applyDoEffects(node, datapoints)
      if (node.data.config.mode === 'escalate') endStatus = 'escalated'
      if (node.data.config.mode === 'finish') endStatus = 'complete'
    } else if (node.data.primitive === PRIMITIVE.ASK) {
      askDraft = mockAskPlaceholder(node.data.config.datapoint)
    }

    return { datapoints, endStatus, askDraft }
  }

  const handleStart = useCallback(() => {
    const entryId = findEntryNodeId(nodes)
    const entryNode = nodes.find((n) => n.id === entryId)
    if (!entryNode) return
    const { datapoints, endStatus, askDraft } = enterNode(entryNode, {})
    setTrace({
      status: endStatus || 'running',
      activeNodeId: entryId,
      prevActiveNodeId: null,
      datapoints,
      askDraft,
      history: [describeNode(entryNode)],
    })
  }, [nodes, setTrace])

  const handleReset = useCallback(() => setTrace(initialTrace), [setTrace])

  const handleStep = useCallback(() => {
    setTrace((t) => {
      if (t.status !== 'running') return t
      const activeNode = nodes.find((n) => n.id === t.activeNodeId)
      if (!activeNode) return t

      let datapoints = t.datapoints
      if (activeNode.data.primitive === PRIMITIVE.ASK) {
        datapoints = { ...datapoints, [activeNode.data.config.datapoint]: t.askDraft }
      }

      const outcome = resolveOutcome(activeNode, nodes, edges, datapoints)

      if (outcome.kind === 'complete') return { ...t, status: 'complete', datapoints }
      if (outcome.kind === 'escalated') return { ...t, status: 'escalated', datapoints }
      if (outcome.kind === 'dead-end') return { ...t, status: 'complete', datapoints }

      const nextNode = nodes.find((n) => n.id === outcome.nextId)
      if (!nextNode) return { ...t, status: 'complete', datapoints }

      const entered = enterNode(nextNode, datapoints)
      return {
        status: entered.endStatus || 'running',
        activeNodeId: nextNode.id,
        prevActiveNodeId: activeNode.id,
        datapoints: entered.datapoints,
        askDraft: entered.askDraft,
        history: [...t.history, describeNode(nextNode)],
      }
    })
  }, [nodes, edges, setTrace])

  const handleAskDraftChange = useCallback((val) => setTrace((t) => ({ ...t, askDraft: val })), [setTrace])

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
        if (n.data.primitive === PRIMITIVE.GOTO && n.data.config.targetId) {
          const target = nodes.find((t) => t.id === n.data.config.targetId)
          data.targetLabel = target?.data.label
        }
        return { ...n, data, selected: n.id === selectedNodeId }
      }),
    [nodes, selectedNodeId, trace],
  )

  const renderedEdges = useMemo(
    () =>
      edges.map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source)
        let conditionLabel = null
        let isDefault = false
        if (sourceNode?.data.primitive === PRIMITIVE.BRANCH) {
          const branch = sourceNode.data.branches?.find((b) => b.id === e.sourceHandle)
          if (branch) {
            conditionLabel = branch.isDefault ? null : branch.condition
            isDefault = branch.isDefault
          }
        }
        const isActive =
          trace.status !== 'idle' && trace.prevActiveNodeId === e.source && trace.activeNodeId === e.target
        return { ...e, data: { ...e.data, conditionLabel, isDefault, isActive }, reconnectable: true }
      }),
    [edges, nodes, trace],
  )

  const activeNode = nodes.find((n) => n.id === trace.activeNodeId) || null

  return (
    <div className="app-shell">
      <TopBar
        status={trace.status}
        onStart={handleStart}
        onStep={handleStep}
        onReset={handleReset}
        activeExampleKey={exampleKey}
        onExampleChange={setExampleKey}
      />
      <div className="app-body">
        <Palette onAdd={handleAddNode} />
        <div className="canvas-wrap">
          <EdgeMarkers />
          <ReactFlow
            key={exampleKey}
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
            graphOps={configGraphOps}
          />
        ) : (
          <TracePanel
            status={trace.status}
            activeNode={activeNode}
            datapoints={trace.datapoints}
            history={trace.history}
            askDraft={trace.askDraft}
            onAskDraftChange={handleAskDraftChange}
            onEditDatapoint={handleEditDatapoint}
          />
        )}
      </div>
    </div>
  )
}

function describeNode(node) {
  return `${node.id}::${PRIMITIVE_META[node.data.primitive].label} — ${node.data.label}`
}
