import {
  buildMindMapEdgePath,
  clampMindMapZoom,
  MAX_MIND_MAP_ZOOM,
  MIN_MIND_MAP_ZOOM,
  zoomMindMapAroundPoint,
  type MindMapViewportState
} from "@/lib/mindMapInteractions";
import { describe, expect, it } from "vitest";

describe("mindMapInteractions", () => {
  it("clamps zoom to configured min/max", () => {
    expect(clampMindMapZoom(0.01)).toBe(MIN_MIND_MAP_ZOOM);
    expect(clampMindMapZoom(9)).toBe(MAX_MIND_MAP_ZOOM);
    expect(clampMindMapZoom(1.2)).toBe(1.2);
  });

  it("keeps the world point under cursor stable when zooming", () => {
    const view: MindMapViewportState = {
      zoom: 1,
      offsetX: -250,
      offsetY: -140
    };
    const anchorX = 420;
    const anchorY = 250;
    const beforeWorldX = (anchorX - view.offsetX) / view.zoom;
    const beforeWorldY = (anchorY - view.offsetY) / view.zoom;

    const next = zoomMindMapAroundPoint({
      view,
      targetZoom: 1.8,
      anchorX,
      anchorY
    });
    const afterWorldX = (anchorX - next.offsetX) / next.zoom;
    const afterWorldY = (anchorY - next.offsetY) / next.zoom;

    expect(afterWorldX).toBeCloseTo(beforeWorldX, 8);
    expect(afterWorldY).toBeCloseTo(beforeWorldY, 8);
  });

  it("builds a cubic bezier path between two nodes", () => {
    const path = buildMindMapEdgePath(
      { x: 100, y: 120, width: 200, height: 60 },
      { x: 520, y: 320, width: 180, height: 56 }
    );

    expect(path.startsWith("M 300 150 C")).toBe(true);
    expect(path.endsWith(", 520 348")).toBe(true);
  });
});
