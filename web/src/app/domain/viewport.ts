import { Bounds } from './geometry';
import { Point } from './model';

/** schermo = mondo * zoom + (x, y) */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function screenToWorld(v: View, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
}

export function worldToScreen(v: View, p: Point): Point {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
}

export function zoomAt(v: View, factor: number, p: Point): View {
  const zoom = clamp(v.zoom * factor);
  const w = screenToWorld(v, p);
  return { zoom, x: p.x - w.x * zoom, y: p.y - w.y * zoom };
}

/** minZoom 0 per le anteprime: il diagramma deve starci tutto anche se diventa minuscolo. */
export function fitView(b: Bounds | null, width: number, height: number, pad = 48, minZoom = MIN_ZOOM): View {
  if (!b) return { x: width / 2, y: height / 2, zoom: 1 };
  const fit = Math.min((width - 2 * pad) / Math.max(b.maxX - b.minX, 1), (height - 2 * pad) / Math.max(b.maxY - b.minY, 1), 1.5);
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, fit));
  return centerOn({ x: 0, y: 0, zoom }, b, width, height);
}

export function centerOn(v: View, b: Bounds, width: number, height: number): View {
  return {
    zoom: v.zoom,
    x: width / 2 - ((b.minX + b.maxX) / 2) * v.zoom,
    y: height / 2 - ((b.minY + b.maxY) / 2) * v.zoom,
  };
}
