import { useState } from 'react'
import { EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import { EDGE_MARKER_ID } from './EdgeMarkers'
import './capEdge.css'

export default function CapEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [hovered, setHovered] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.32,
  })

  const isGoto = !!data?.isGoto
  const isActive = !!data?.isActive
  const markerKey = isActive ? 'active' : hovered ? 'hover' : isGoto ? 'goto' : 'default'

  const classes = [
    'cap-edge',
    'react-flow__edge-path',
    data?.isDefault ? 'cap-edge--default' : '',
    isGoto ? 'cap-edge--goto' : '',
    isActive ? 'cap-edge--active' : '',
    hovered ? 'cap-edge--hover' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = isGoto ? 'go to' : data?.conditionLabel

  return (
    <>
      {/* Wide, invisible hit area — the visible stroke is too thin to hover reliably. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="cap-edge__hit"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <path d={edgePath} className={classes} fill="none" markerEnd={`url(#${EDGE_MARKER_ID[markerKey]})`} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={`cap-edge__label ${data?.isDefault ? 'cap-edge__label--default' : ''} ${
              isGoto ? 'cap-edge__label--goto' : ''
            } ${isActive ? 'cap-edge__label--active' : ''} ${hovered ? 'cap-edge__label--hover' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
