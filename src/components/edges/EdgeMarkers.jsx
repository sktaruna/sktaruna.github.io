// Shared arrowhead <marker> defs for CapEdge, rendered once at the canvas
// root so every edge instance can reference an id instead of each defining
// (and duplicating) its own <defs>.
export const EDGE_MARKER_ID = {
  default: 'cap-arrow',
  goto: 'cap-arrow-goto',
  hover: 'cap-arrow-hover',
  active: 'cap-arrow-active',
}

const MARKERS = [
  { id: EDGE_MARKER_ID.default, color: '#7c8aad' },
  { id: EDGE_MARKER_ID.goto, color: '#f5b556' },
  { id: EDGE_MARKER_ID.hover, color: '#4f8cff' },
  { id: EDGE_MARKER_ID.active, color: '#34d6d6' },
]

export default function EdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        {MARKERS.map((m) => (
          <marker
            key={m.id}
            id={m.id}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={m.color} />
          </marker>
        ))}
      </defs>
    </svg>
  )
}
