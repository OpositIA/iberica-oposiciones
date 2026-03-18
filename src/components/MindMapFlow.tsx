import {
  Background,
  Controls,
  Edge,
  Handle,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Minus, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MindMapNode {
  id: string;
  label: string;
  children: string[];
  isExpanded: boolean;
}

export type MindMapChildPayload = {
  id: string;
  label: string;
  hasMore?: boolean;
};

export type MindMapChildrenFetcher = (
  node: MindMapNode
) => Promise<MindMapChildPayload[]>;

type InternalMindMapNode = MindMapNode & {
  hasMore: boolean;
  isLoading: boolean;
  hasFetchedChildren: boolean;
};

type FlowNodeData = {
  label: string;
  isExpanded: boolean;
  isLoading: boolean;
  canToggle: boolean;
  onToggle: (nodeId: string) => void;
};

type FlowNode = Node<FlowNodeData, "mindmap">;

type MindMapFlowProps = {
  topic: string;
  className?: string;
  rootNodeId?: string;
  fetchChildren?: MindMapChildrenFetcher;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildMockChildren = async (
  node: MindMapNode
): Promise<MindMapChildPayload[]> => {
  await wait(420 + Math.round(Math.random() * 260));

  const depth = Math.max(0, node.id.split(".").length - 1);
  if (depth >= 3) return [];

  const count = depth === 0 ? 4 : depth === 1 ? 3 : 2;
  return Array.from({ length: count }, (_unused, index) => {
    const ordinal = index + 1;
    return {
      id: `${node.id}.${ordinal}`,
      label: depth === 0 ? `Bloque ${ordinal}` : `${node.label} ${ordinal}`,
      hasMore: depth < 2
    };
  });
};

const MindMapNodeCard = memo(({ id, data }: NodeProps<FlowNode>) => {
  const onNodeClick = () => data.onToggle(id);

  return (
    <div
      onClick={onNodeClick}
      className="group relative min-w-[190px] max-w-[260px] cursor-pointer rounded-2xl border border-border bg-background px-3 py-2 shadow-sm transition-all duration-200 hover:shadow-md"
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-0 !w-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!h-0 !w-0 !border-0 !bg-transparent"
      />

      <p className="pr-9 text-sm font-medium text-foreground">{data.label}</p>

      {data.canToggle ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onToggle(id);
          }}
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-secondary text-foreground transition group-hover:border-primary/60 group-hover:text-primary"
          aria-label={data.isExpanded ? "Contraer nodo" : "Expandir nodo"}
          title={data.isExpanded ? "Contraer nodo" : "Expandir nodo"}
        >
          {data.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : data.isExpanded ? (
            <Minus className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
});

MindMapNodeCard.displayName = "MindMapNodeCard";

const nodeTypes = {
  mindmap: MindMapNodeCard
};

const useMindMapState = (
  topic: string,
  rootNodeId: string,
  fetchChildren: MindMapChildrenFetcher
) => {
  const [nodeMap, setNodeMap] = useState<Record<string, InternalMindMapNode>>({
    [rootNodeId]: {
      id: rootNodeId,
      label: topic,
      children: [],
      isExpanded: false,
      hasMore: true,
      isLoading: false,
      hasFetchedChildren: false
    }
  });

  useEffect(() => {
    setNodeMap({
      [rootNodeId]: {
        id: rootNodeId,
        label: topic,
        children: [],
        isExpanded: false,
        hasMore: true,
        isLoading: false,
        hasFetchedChildren: false
      }
    });
  }, [rootNodeId, topic]);

  const nodeMapRef = useRef(nodeMap);
  useEffect(() => {
    nodeMapRef.current = nodeMap;
  }, [nodeMap]);

  const toggleNode = useCallback(
    async (nodeId: string) => {
      const current = nodeMapRef.current[nodeId];
      if (!current || current.isLoading) return;

      if (current.isExpanded) {
        setNodeMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            isExpanded: false
          }
        }));
        return;
      }

      if (current.hasFetchedChildren) {
        setNodeMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            isExpanded: prev[nodeId].children.length > 0
          }
        }));
        return;
      }

      setNodeMap((prev) => ({
        ...prev,
        [nodeId]: {
          ...prev[nodeId],
          isLoading: true
        }
      }));

      try {
        const fetchedChildren = await fetchChildren({
          id: current.id,
          label: current.label,
          children: current.children,
          isExpanded: current.isExpanded
        });

        setNodeMap((prev) => {
          const parent = prev[nodeId];
          if (!parent) return prev;

          const next = { ...prev };
          const nextChildIds = [...parent.children];
          const seenChildren = new Set(nextChildIds);

          fetchedChildren.forEach((child, index) => {
            const childId = child.id || `${nodeId}.${index + 1}`;
            if (!seenChildren.has(childId)) {
              nextChildIds.push(childId);
              seenChildren.add(childId);
            }

            if (!next[childId]) {
              next[childId] = {
                id: childId,
                label: child.label,
                children: [],
                isExpanded: false,
                hasMore: child.hasMore ?? true,
                isLoading: false,
                hasFetchedChildren: false
              };
            }
          });

          next[nodeId] = {
            ...parent,
            children: nextChildIds,
            hasFetchedChildren: true,
            hasMore: nextChildIds.length > 0,
            isExpanded: nextChildIds.length > 0,
            isLoading: false
          };

          return next;
        });
      } catch {
        setNodeMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            isLoading: false
          }
        }));
      }
    },
    [fetchChildren]
  );

  return { nodeMap, toggleNode };
};

const MindMapFlow = ({
  topic,
  className,
  rootNodeId = "topic-root",
  fetchChildren = buildMockChildren
}: MindMapFlowProps) => {
  const { nodeMap, toggleNode } = useMindMapState(
    topic,
    rootNodeId,
    fetchChildren
  );

  const { flowNodes, flowEdges } = useMemo(() => {
    const visibleNodeIds: string[] = [];
    const visibleEdges: Array<{ source: string; target: string }> = [];
    const depthById = new Map<string, number>();

    const walk = (nodeId: string, depth: number) => {
      const node = nodeMap[nodeId];
      if (!node) return;

      visibleNodeIds.push(nodeId);
      depthById.set(nodeId, depth);

      if (!node.isExpanded) return;

      node.children.forEach((childId) => {
        if (!nodeMap[childId]) return;
        visibleEdges.push({ source: nodeId, target: childId });
        walk(childId, depth + 1);
      });
    };

    walk(rootNodeId, 0);

    const idsByDepth = new Map<number, string[]>();
    visibleNodeIds.forEach((nodeId) => {
      const depth = depthById.get(nodeId) ?? 0;
      const bucket = idsByDepth.get(depth) ?? [];
      bucket.push(nodeId);
      idsByDepth.set(depth, bucket);
    });

    const xGap = 280;
    const yGap = 110;
    const positionById = new Map<string, { x: number; y: number }>();

    idsByDepth.forEach((bucket, depth) => {
      const centerOffset = (bucket.length - 1) / 2;
      bucket.forEach((nodeId, index) => {
        positionById.set(nodeId, {
          x: depth * xGap,
          y: (index - centerOffset) * yGap
        });
      });
    });

    const nextFlowNodes: FlowNode[] = visibleNodeIds.map((nodeId) => {
      const node = nodeMap[nodeId];
      const position = positionById.get(nodeId) ?? { x: 0, y: 0 };
      const canToggle =
        node.children.length > 0 || node.hasMore || node.isLoading;

      return {
        id: nodeId,
        type: "mindmap",
        position,
        draggable: false,
        selectable: false,
        data: {
          label: node.label,
          isExpanded: node.isExpanded,
          isLoading: node.isLoading,
          canToggle,
          onToggle: toggleNode
        },
        style: {
          transition: "transform 220ms ease, opacity 220ms ease"
        }
      };
    });

    const nextFlowEdges: Edge[] = visibleEdges.map((edge) => ({
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      animated: true,
      style: { stroke: "hsl(var(--border))", strokeWidth: 1.4 }
    }));

    return { flowNodes: nextFlowNodes, flowEdges: nextFlowEdges };
  }, [nodeMap, rootNodeId, toggleNode]);

  return (
    <div
      className={
        className ??
        "h-[560px] w-full overflow-hidden rounded-2xl border border-border bg-background"
      }
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.45}
          maxZoom={1.8}
          nodesDraggable={false}
          elementsSelectable={false}
          panOnDrag
          panOnScroll
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="hsl(var(--border) / 0.4)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default MindMapFlow;
