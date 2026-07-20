import dagre from '@dagrejs/dagre'

const NODE_WIDTH = 236
const DEFAULT_NODE_HEIGHT = 120

// Re-flows the graph top-to-bottom with dagre, using each node's actual
// rendered size (from React Flow's measured dimensions) so branchy nodes
// with routes-out lists don't overlap the row below them.
export function layoutTopToBottom(nodes, edges) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90 })

  nodes.forEach((n) => {
    g.setNode(n.id, {
      width: n.measured?.width || NODE_WIDTH,
      height: n.measured?.height || DEFAULT_NODE_HEIGHT,
    })
  })
  edges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    if (!pos) return n
    return { ...n, position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 } }
  })
}
