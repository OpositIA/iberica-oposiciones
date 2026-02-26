export type MindMapViewportState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type MindMapNodeGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MIN_MIND_MAP_ZOOM = 0.2;
export const MAX_MIND_MAP_ZOOM = 2.5;

export const clampMindMapZoom = (
  value: number,
  minZoom = MIN_MIND_MAP_ZOOM,
  maxZoom = MAX_MIND_MAP_ZOOM
) => Math.min(maxZoom, Math.max(minZoom, value));

export const zoomMindMapAroundPoint = ({
  view,
  targetZoom,
  anchorX,
  anchorY,
  minZoom = MIN_MIND_MAP_ZOOM,
  maxZoom = MAX_MIND_MAP_ZOOM
}: {
  view: MindMapViewportState;
  targetZoom: number;
  anchorX: number;
  anchorY: number;
  minZoom?: number;
  maxZoom?: number;
}): MindMapViewportState => {
  const nextZoom = clampMindMapZoom(targetZoom, minZoom, maxZoom);
  if (nextZoom === view.zoom) return view;

  const worldX = (anchorX - view.offsetX) / view.zoom;
  const worldY = (anchorY - view.offsetY) / view.zoom;

  return {
    zoom: nextZoom,
    offsetX: anchorX - worldX * nextZoom,
    offsetY: anchorY - worldY * nextZoom
  };
};

export const buildMindMapEdgePath = (
  fromNode: MindMapNodeGeometry,
  toNode: MindMapNodeGeometry
) => {
  const x1 = fromNode.x + fromNode.width;
  const y1 = fromNode.y + fromNode.height / 2;
  const x2 = toNode.x;
  const y2 = toNode.y + toNode.height / 2;
  const controlOffset = Math.max(58, Math.abs(x2 - x1) * 0.36);
  return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
};
