import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { Bounds, GRID } from '../../domain/geometry';
import { addTable, moveTables, renameTable, updateColumn } from '../../domain/logical-commands';
import { HEADER_H, ROW_H, Rect, fkEdges, logicalBounds, rowY, tableAt, tableRect } from '../../domain/logical-geometry';
import { Id, Point, tableById } from '../../domain/model';
import { View, centerOn, fitView, screenToWorld, worldToScreen, zoomAt } from '../../domain/viewport';
import { EditorStore } from '../editor-store';

type Gesture =
  | { kind: 'pan'; start: Point; view: View }
  | { kind: 'move'; start: Point; ids: Id[]; moved: boolean }
  | { kind: 'fk'; tableId: Id; row: number };

@Component({
  selector: 'app-logical-canvas',
  templateUrl: './logical-canvas.html',
  host: { class: 'block relative h-full w-full overflow-hidden', '(document:keydown)': 'onKey($event)' },
})
export class LogicalCanvas {
  protected readonly store = inject(EditorStore);
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  readonly view = signal<View>({ x: 0, y: 0, zoom: 1 });
  readonly ghost = signal<{ from: Point; to: Point } | null>(null);
  readonly editing = signal<{ tableId: Id; colId: Id | null; x: number; y: number; value: string } | null>(null);

  protected readonly HEADER_H = HEADER_H;
  protected readonly ROW_H = ROW_H;

  private readonly logical = computed(() => this.store.diagram().logical);
  readonly tables = computed(() => {
    const l = this.logical();
    const sel = this.store.selection();
    const bad = new Set(this.store.logicalIssues().filter((i) => i.severity === 'error').flatMap((i) => i.targetIds));
    return (l?.tables ?? []).map((t) => ({
      t,
      rect: tableRect(t),
      selected: sel.has(t.id),
      error: bad.has(t.id),
      rows: t.columns.map((c, i) => ({
        c,
        y: rowY(t, i),
        pk: t.primaryKey.includes(c.id),
        fk: t.foreignKeys.some((f) => f.columnIds.includes(c.id)),
      })),
    }));
  });
  readonly edges = computed(() => {
    const l = this.logical();
    const sel = this.store.selection();
    return l ? fkEdges(l).map((e) => ({ ...e, selected: sel.has(e.id), line: this.points(e.points), head: this.points(e.arrow) })) : [];
  });
  readonly transform = computed(() => {
    const v = this.view();
    return `translate(${v.x} ${v.y}) scale(${v.zoom})`;
  });
  readonly gridSize = computed(() => GRID * this.view().zoom);
  readonly zoomPct = computed(() => Math.round(this.view().zoom * 100));

  private gesture: Gesture | null = null;
  private userMoved = false;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      this.store.loadCount();
      untracked(() => {
        this.userMoved = false;
        setTimeout(() => this.fit());
      });
    });
    effect(() => {
      const req = this.store.focusRequest();
      if (req) untracked(() => this.focus(req.ids));
    });
    effect(() => {
      if (this.store.fitRequest()) untracked(() => this.fit());
    });
    effect(() => {
      const el = this.renameInput()?.nativeElement;
      if (el) queueMicrotask(() => {
        el.focus();
        el.select();
      });
    });
    afterNextRender(() => {
      this.store.canvasSvg = () => this.svgRef().nativeElement;
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        if (!this.userMoved) this.fit();
      });
      ro.observe(this.svgRef().nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  // --- vista ---
  fit(): void {
    const r = this.rect();
    const l = this.logical();
    if (!r.width || !r.height) return;
    this.view.set(fitView(l ? logicalBounds(l) : null, r.width, r.height));
  }

  zoomBy(factor: number): void {
    const r = this.rect();
    this.userMoved = true;
    this.view.update((v) => zoomAt(v, factor, { x: r.width / 2, y: r.height / 2 }));
  }

  private focus(ids: Id[]): void {
    const l = this.logical();
    const owners = new Set(ids.map((id) => tableById(this.store.diagram(), id)?.id ?? this.ownerOfFk(id)).filter((x): x is Id => !!x));
    const rects: Rect[] = (l?.tables ?? []).filter((t) => owners.has(t.id)).map(tableRect);
    const r = this.rect();
    if (!rects.length || !r.width) return;
    const b: Bounds = {
      minX: Math.min(...rects.map((x) => x.x)), minY: Math.min(...rects.map((x) => x.y)),
      maxX: Math.max(...rects.map((x) => x.x + x.w)), maxY: Math.max(...rects.map((x) => x.y + x.h)),
    };
    this.userMoved = true;
    this.view.update((v) => centerOn({ ...v, zoom: Math.max(v.zoom, 0.8) }, b, r.width, r.height));
  }

  private ownerOfFk(fkId: Id): Id | undefined {
    return this.logical()?.tables.find((t) => t.foreignKeys.some((f) => f.id === fkId))?.id;
  }

  // --- coordinate ---
  private rect(): DOMRect {
    return this.svgRef().nativeElement.getBoundingClientRect();
  }
  private screen(ev: { clientX: number; clientY: number }): Point {
    const r = this.rect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  private world(ev: { clientX: number; clientY: number }): Point {
    return screenToWorld(this.view(), this.screen(ev));
  }
  private editable(): boolean {
    return !this.store.readonly();
  }
  private capture(ev: PointerEvent): void {
    this.svgRef().nativeElement.setPointerCapture?.(ev.pointerId);
  }

  protected points(list: Point[]): string {
    return list.map((p) => `${p.x},${p.y}`).join(' ');
  }
  protected headPath(r: Rect): string {
    const k = 8;
    return `M${r.x} ${r.y + HEADER_H}V${r.y + k}a${k} ${k} 0 0 1 ${k} -${k}H${r.x + r.w - k}a${k} ${k} 0 0 1 ${k} ${k}V${r.y + HEADER_H}Z`;
  }

  // --- eventi ---
  onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    this.userMoved = true;
    const factor = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
    this.view.update((v) => zoomAt(v, factor, this.screen(ev)));
  }

  onBackgroundDown(ev: PointerEvent): void {
    this.capture(ev);
    if (this.editable() && this.store.tool() === 'table') {
      const w = this.world(ev);
      const p = { x: Math.round(w.x / GRID) * GRID, y: Math.round(w.y / GRID) * GRID };
      const id = this.store.create((d) => addTable(d, p));
      this.store.tool.set('select');
      this.startRename(id, null);
      return;
    }
    if (this.store.tool() === 'select') this.store.select([]);
    this.gesture = { kind: 'pan', start: this.screen(ev), view: this.view() };
  }

  onTableDown(ev: PointerEvent, id: Id): void {
    ev.stopPropagation();
    this.capture(ev);
    if (!this.editable()) {
      this.store.select([id]);
      this.gesture = { kind: 'pan', start: this.screen(ev), view: this.view() };
      return;
    }
    if (ev.shiftKey) {
      this.store.toggleSelect(id);
      return;
    }
    if (!this.store.selection().has(id)) this.store.select([id]);
    const d = this.store.diagram();
    const ids = [...this.store.selection()].filter((x) => tableById(d, x));
    this.store.beginDrag();
    this.gesture = { kind: 'move', start: this.world(ev), ids, moved: false };
  }

  onHandleDown(ev: PointerEvent, tableId: Id, row: number): void {
    ev.stopPropagation();
    if (!this.editable()) return;
    this.capture(ev);
    this.gesture = { kind: 'fk', tableId, row };
  }

  onEdgeDown(ev: PointerEvent, id: Id): void {
    ev.stopPropagation();
    this.capture(ev);
    this.store.select([id]);
  }

  onMove(ev: PointerEvent): void {
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pan') {
      const p = this.screen(ev);
      this.userMoved = true;
      this.view.set({ ...g.view, x: g.view.x + p.x - g.start.x, y: g.view.y + p.y - g.start.y });
    } else if (g.kind === 'move') {
      const w = this.world(ev);
      let dx = w.x - g.start.x;
      let dy = w.y - g.start.y;
      if (!ev.altKey) {
        dx = Math.round(dx / GRID) * GRID;
        dy = Math.round(dy / GRID) * GRID;
      }
      if (dx || dy) g.moved = true;
      if (g.moved) this.store.dragTo((base) => moveTables(base, g.ids, dx, dy));
    } else {
      const t = tableById(this.store.diagram(), g.tableId);
      if (!t) return;
      const r = tableRect(t);
      this.ghost.set({ from: { x: r.x + r.w, y: rowY(t, g.row) }, to: this.world(ev) });
    }
  }

  onUp(ev: PointerEvent): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    if (g.kind === 'move') {
      if (g.moved) this.store.endDrag();
      else this.store.cancelDrag();
    } else if (g.kind === 'fk') {
      this.ghost.set(null);
      const l = this.logical();
      const target = l && tableAt(l, this.world(ev));
      if (target) this.store.addForeignKeyFromColumn(g.tableId, g.row, target.id);
    }
  }

  // --- tastiera e rinomina ---
  onKey(ev: KeyboardEvent): void {
    if (this.editing()) return;
    const t = ev.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const s = this.store;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod) {
      if (k === 'z') { ev.preventDefault(); if (ev.shiftKey) s.redo(); else s.undo(); }
      else if (k === 'y') { ev.preventDefault(); s.redo(); }
      else if (k === 'a') { ev.preventDefault(); s.selectAll(); }
      return;
    }
    if (k === 'f') { this.fit(); return; }
    if (s.readonly()) return;
    const step = ev.shiftKey ? 1 : GRID;
    switch (ev.key) {
      case 'Delete':
      case 'Backspace': ev.preventDefault(); s.deleteSelection(); return;
      case 'Escape': s.cancelTool(); this.ghost.set(null); return;
      case 'Enter': {
        const only = s.selection().size === 1 ? [...s.selection()][0] : null;
        if (only && tableById(s.diagram(), only)) this.startRename(only, null);
        return;
      }
      case 'ArrowUp': ev.preventDefault(); s.nudge(0, -step); return;
      case 'ArrowDown': ev.preventDefault(); s.nudge(0, step); return;
      case 'ArrowLeft': ev.preventDefault(); s.nudge(-step, 0); return;
      case 'ArrowRight': ev.preventDefault(); s.nudge(step, 0); return;
    }
    switch (k) {
      case 'v': s.cancelTool(); break;
      case 't': s.tool.set('table'); break;
      case 'l': void s.layoutLogical(); break;
    }
  }

  onDblClickTable(ev: MouseEvent, id: Id): void {
    ev.stopPropagation();
    this.startRename(id, null);
  }

  onDblClickColumn(ev: MouseEvent, tableId: Id, colId: Id): void {
    ev.stopPropagation();
    this.startRename(tableId, colId);
  }

  private startRename(tableId: Id, colId: Id | null): void {
    if (!this.editable()) return;
    const t = tableById(this.store.diagram(), tableId);
    if (!t) return;
    const col = colId ? t.columns.find((c) => c.id === colId) : undefined;
    if (colId && !col) return;
    const r = tableRect(t);
    const at = worldToScreen(this.view(), {
      x: r.x + r.w / 2,
      y: col ? rowY(t, t.columns.indexOf(col)) : r.y + HEADER_H / 2,
    });
    this.editing.set({ tableId, colId, x: at.x, y: at.y, value: col ? col.name : t.name });
  }

  commitRename(value: string): void {
    const ed = this.editing();
    if (!ed) return;
    this.editing.set(null);
    if (value.trim() === ed.value.trim()) return;
    this.store.apply((d) => (ed.colId ? updateColumn(d, ed.tableId, ed.colId, { name: value }) : renameTable(d, ed.tableId, value)));
  }
}
