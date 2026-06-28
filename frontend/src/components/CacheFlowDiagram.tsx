import { useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  Background,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export type FlashState = { nodeId: string; color: 'green' | 'red' | 'yellow' | 'blue' } | null

type FlowNode = Node<{ label: string; flash: string | null; badge?: number | null }>

function CacheNode({ data }: NodeProps<FlowNode>) {
  const flash = data.flash
  const borderClass = flash === 'green'
    ? 'border-green-400 shadow-green-400/60'
    : flash === 'red'
    ? 'border-red-400 shadow-red-400/60'
    : flash === 'yellow'
    ? 'border-yellow-400 shadow-yellow-400/60'
    : flash === 'blue'
    ? 'border-blue-400 shadow-blue-400/60'
    : 'border-gray-600'

  return (
    <div
      className={`relative px-5 py-3 rounded-lg bg-gray-800 border-2 ${borderClass} text-sm font-semibold text-gray-100 select-none transition-all duration-150 ${flash ? 'shadow-lg' : ''}`}
      style={{ minWidth: 90, textAlign: 'center' }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-500" />
      {data.label}
      {data.badge != null && data.badge > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
          {data.badge}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-500" />
    </div>
  )
}

const nodeTypes = { cacheNode: CacheNode }

type Props = {
  activeEdges?: string[]
  flash?: FlashState
  dbBadge?: number | null
}

export function CacheFlowDiagram({ activeEdges = [], flash = null, dbBadge = null }: Props) {
  const nodes: FlowNode[] = [
    {
      id: 'client',
      type: 'cacheNode',
      position: { x: 30, y: 80 },
      data: {
        label: 'Client',
        flash: flash?.nodeId === 'client' ? flash.color : null,
      },
    },
    {
      id: 'cache',
      type: 'cacheNode',
      position: { x: 200, y: 80 },
      data: {
        label: 'Cache',
        flash: flash?.nodeId === 'cache' ? flash.color : null,
      },
    },
    {
      id: 'db',
      type: 'cacheNode',
      position: { x: 370, y: 80 },
      data: {
        label: 'DB',
        flash: flash?.nodeId === 'db' ? flash.color : null,
        badge: dbBadge,
      },
    },
  ]

  const edges: Edge[] = [
    {
      id: 'client-cache',
      source: 'client',
      target: 'cache',
      animated: activeEdges.includes('client-cache'),
      style: { stroke: activeEdges.includes('client-cache') ? '#6366f1' : '#4b5563', strokeWidth: 2 },
    },
    {
      id: 'cache-client',
      source: 'cache',
      target: 'client',
      animated: activeEdges.includes('cache-client'),
      style: { stroke: activeEdges.includes('cache-client') ? '#22c55e' : '#4b5563', strokeWidth: 2 },
    },
    {
      id: 'cache-db',
      source: 'cache',
      target: 'db',
      animated: activeEdges.includes('cache-db'),
      style: { stroke: activeEdges.includes('cache-db') ? '#eab308' : '#4b5563', strokeWidth: 2 },
    },
    {
      id: 'db-cache',
      source: 'db',
      target: 'cache',
      animated: activeEdges.includes('db-cache'),
      style: { stroke: activeEdges.includes('db-cache') ? '#eab308' : '#4b5563', strokeWidth: 2 },
    },
    {
      id: 'client-db',
      source: 'client',
      target: 'db',
      animated: activeEdges.includes('client-db'),
      style: {
        stroke: activeEdges.includes('client-db') ? '#f97316' : '#4b5563',
        strokeWidth: 2,
        strokeDasharray: '5,5',
      },
      type: 'straight',
    },
  ]

  const onInit = useCallback(() => {}, [])

  return (
    <ReactFlowProvider>
      <div style={{ height: 200 }} className="bg-gray-900 rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={onInit}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#374151" gap={16} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  )
}
