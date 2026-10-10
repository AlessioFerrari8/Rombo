import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { EditorStore } from '../editor-store';
import {
  addAttribute, addEntity, addRelationship, moveElements, rename, toggleIdentifierAttribute, updateAttribute,
} from '../../domain/commands';
import { Box, GRID, rhombusPoints } from '../../domain/geometry';
import { Id, Point, entityById, findAttribute, findPart, relationshipById } from '../../domain/model';
import { IsaView, buildScene, elementBounds } from '../../domain/scene';
import { View, centerOn, fitView, screenToWorld, worldToScreen, zoomAt } from '../../domain/viewport';

type Gesture =
  | { kind: 'pan'; start: Point; view: View }
  | { kind: 'move'; start: Point; ids: Id[]; moved: boolean }
  | { kind: 'attr'; attrId: Id; ownerId: Id; start: Point; moved: boolean }
  | { kind: 'marquee'; start: Point; additive: boolean }
  | { kind: 'connect'; from: Id; start: Point; left: boolean };

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.html',
  host: { class: 'block relative h-full w-full overflow-hidden', '(document:keydown)': 'onKey($event)' },
})
export class Canvas {
  protected readonly store = inject(EditorStore);
  /** false nelle anteprime: niente input, il disegno si adatta al riquadro. */
  readonly interactive = input(true);

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  readonly view = signal<View>({ x: 0, y: 0, zoom: 1 });
  readonly scene = computed(() => buildScene(this.store.diagram(), this.store.issues(), this.store.selection()));
  readonly transform = computed(() => {
    const v = this.view();
    return `translate(${v.x} ${v.y}) scale(${v.zoom})`;
  });
  readonly gridSize = computed(() => GRID * this.view().zoom);
  readonly zoomPct = computed(() => Math.round(this.view().zoom * 100));
  readonly marquee = signal<Box | null>(null);
  readonly ghost = signal<{ from: Point; to: Point } | null>(null);
  readonly editing = signal<{ id: Id; x: number; y: number; value: string; attr: boolean } | null>(null);
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  private gesture: Gesture | null = null;
  private readonly pointers = new Map<number, Point>();
  private pinch: { dist: number; view: View; center: Point } | null = null;
  private userMoved = false;
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rhombus = rhombusPoints;

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
    afterNextRender(() => {
      if (this.interactive()) this.store.canvasSvg = () => this.svgRef().nativeElement;
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        if (!this.userMoved) this.fit();
      });
      ro.observe(this.svgRef().nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
    effect(() => {
      const el = this.renameInput()?.nativeElement;
      if (el) queueMicrotask(() => {
        el.focus();
        el.select();
      });
    });
  }

  fit(): void {
    const r = this.rect();
    if (!r.width || !r.height) return;
    const b = this.scene().bounds;
    this.view.set(this.interactive() ? fitView(b, r.width, r.height) : fitView(b, r.width, r.height, 8, 0));
  }

  zoomBy(factor: number): void {
    const r = this.rect();
    this.userMoved = true;
    this.view.update((v) => zoomAt(v, factor, { x: r.width / 2, y: r.height / 2 }));
  }

  private focus(ids: Id[]): void {
    const b = elementBounds(this.scene(), ids);
    const r = this.rect();
    if (!b || !r.width) return;
    this.userMoved = true;
    this.view.update((v) => centerOn({ ...v, zoom: Math.max(v.zoom, 0.8) }, b, r.width, r.height));
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
  protected toScreen(p: Point): Point {
    return worldToScreen(this.view(), p);
  }
  private editable(): boolean {
    return this.interactive() && !this.store.readonly();
  }
  private capture(ev: PointerEvent): void {
    this.svgRef().nativeElement.setPointerCapture?.(ev.pointerId);
    this.pointers.set(ev.pointerId, this.screen(ev));
  }

  // --- template helpers ---
  protected points(list: Point[]): string {
    return list.map((p) => `${p.x},${p.y}`).join(' ');
  }
  protected arrow(isa: IsaView): string {
    const a = isa.geom.arrow;
    return this.points([a.tip, a.left, a.right]);
  }

  // --- eventi ---
  onWheel(ev: WheelEvent): void {
    if (!this.interactive()) return;
    ev.preventDefault();
    this.userMoved = true;
    const factor = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
    this.view.update((v) => zoomAt(v, factor, this.screen(ev)));
  }

  onBackgroundDown(ev: PointerEvent): void {
    if (!this.interactive()) return;
    this.capture(ev);
    if (this.startPinch()) return;
    if (this.editable() && this.store.tool() === 'entity') {
      const w = this.world(ev);
      const p = { x: Math.round(w.x / GRID) * GRID, y: Math.round(w.y / GRID) * GRID };
      const id = this.store.create((d) => addEntity(d, p));
      this.store.tool.set('select');
      this.startRenameById(id);
      return;
    }
    if (this.editable() && ev.shiftKey) {
      this.gesture = { kind: 'marquee', start: this.world(ev), additive: true };
      return;
    }
    if (this.store.tool() === 'select') this.store.select([]);
    this.gesture = { kind: 'pan', start: this.screen(ev), view: this.view() };
  }

  onShapeDown(ev: PointerEvent, id: Id): void {
    if (!this.interactive()) return;
    ev.stopPropagation();
    this.capture(ev);
    if (this.startPinch()) return;
    const d = this.store.diagram();
    const isEntity = !!entityById(d, id);
    const isMovable = isEntity || !!relationshipById(d, id);
    if (!this.editable()) {
      this.store.select([id]);
      this.gesture = { kind: 'pan', start: this.screen(ev), view: this.view() };
      return;
    }
    switch (this.store.tool()) {
      case 'attribute':
        if (isMovable) {
          this.store.create((x) => addAttribute(x, id));
          this.store.tool.set('select');
        }
        return;
      case 'relationship':
        if (isEntity) this.gesture = { kind: 'connect', from: id, start: this.world(ev), left: false };
        return;
      case 'isa':
        if (isEntity) this.store.isaClick(id);
        return;
    }
    if (ev.shiftKey) {
      this.store.toggleSelect(id);
      return;
    }
    if (!this.store.selection().has(id)) this.store.select([id]);
    const ids = [...this.store.selection()].filter((x) => entityById(d, x) || relationshipById(d, x));
    if (!ids.length) return;
    this.store.beginDrag();
    this.gesture = { kind: 'move', start: this.world(ev), ids, moved: false };
  }

  onDotDown(ev: PointerEvent, attrId: Id, ownerId: Id): void {
    if (!this.interactive()) return;
    ev.stopPropagation();
    this.capture(ev);
    if (!this.editable()) {
      this.store.select([attrId]);
      return;
    }
    this.store.beginDrag();
    this.gesture = { kind: 'attr', attrId, ownerId, start: this.screen(ev), moved: false };
  }

  onMove(ev: PointerEvent): void {
    if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, this.screen(ev));
    if (this.movePinch()) return;
    const g = this.gesture;
    if (!g) return;
    switch (g.kind) {
      case 'pan': {
        const p = this.screen(ev);
        this.userMoved = true;
        this.view.set({ ...g.view, x: g.view.x + p.x - g.start.x, y: g.view.y + p.y - g.start.y });
        break;
      }
      case 'move': {
        const w = this.world(ev);
        let dx = w.x - g.start.x;
        let dy = w.y - g.start.y;
        if (!ev.altKey) {
          dx = Math.round(dx / GRID) * GRID;
          dy = Math.round(dy / GRID) * GRID;
        }
        if (dx || dy) g.moved = true;
        if (g.moved) this.store.dragTo((base) => moveElements(base, g.ids, dx, dy));
        break;
      }
      case 'attr': {
        const p = this.screen(ev);
        if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 4) break;
        g.moved = true;
        const d = this.store.diagram();
        const owner = entityById(d, g.ownerId) ?? relationshipById(d, g.ownerId);
        if (!owner) break;
        const w = this.world(ev);
        const angle = Math.atan2(w.y - owner.pos.y, w.x - owner.pos.x);
        this.store.dragTo((base) => updateAttribute(base, g.attrId, { angle }));
        break;
      }
      case 'marquee': {
        const w = this.world(ev);
        this.marquee.set({ x: Math.min(g.start.x, w.x), y: Math.min(g.start.y, w.y), w: Math.abs(w.x - g.start.x), h: Math.abs(w.y - g.start.y) });
        break;
      }
      case 'connect': {
        const from = entityById(this.store.diagram(), g.from);
        const w = this.world(ev);
        if (from) this.ghost.set({ from: from.pos, to: w });
        const box = this.scene().entities.find((e) => e.id === g.from)?.box;
        if (box && (Math.abs(w.x - box.x) > box.w / 2 || Math.abs(w.y - box.y) > box.h / 2)) g.left = true;
        break;
      }
    }
  }

  onUp(ev: PointerEvent): void {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    switch (g.kind) {
      case 'move':
        if (g.moved) this.store.endDrag();
        else this.store.cancelDrag();
        break;
      case 'attr':
        if (g.moved) {
          this.store.endDrag();
        } else {
          this.store.cancelDrag();
          if (entityById(this.store.diagram(), g.ownerId)) {
            this.store.apply((x) => toggleIdentifierAttribute(x, g.ownerId, g.attrId));
          }
          this.store.select([g.attrId]);
        }
        break;
      case 'marquee': {
        const m = this.marquee();
        this.marquee.set(null);
        if (!m) break;
        const inside = [...this.scene().entities, ...this.scene().relationships]
          .filter((s) => s.box.x >= m.x && s.box.x <= m.x + m.w && s.box.y >= m.y && s.box.y <= m.y + m.h)
          .map((s) => s.id);
        this.store.select(inside, g.additive);
        break;
      }
      case 'connect': {
        this.ghost.set(null);
        const w = this.world(ev);
        const target = [...this.scene().entities].reverse().find((s) => Math.abs(w.x - s.box.x) <= s.box.w / 2 && Math.abs(w.y - s.box.y) <= s.box.h / 2);
        if (!target) break;
        // sulla stessa entita': ricorsiva se il puntatore ne e' uscito ed e' rientrato
        if (target.id !== g.from || g.left) {
          this.store.create((d) => addRelationship(d, [g.from, target.id]));
          this.store.tool.set('select');
        }
        break;
      }
    }
  }

  private startPinch(): boolean {
    if (this.pointers.size !== 2) return false;
    if (this.gesture?.kind === 'move' || this.gesture?.kind === 'attr') this.store.cancelDrag();
    this.gesture = null;
    this.marquee.set(null);
    this.ghost.set(null);
    const [a, b] = [...this.pointers.values()];
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, view: this.view(), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    return true;
  }

  private movePinch(): boolean {
    if (!this.pinch || this.pointers.size !== 2) return false;
    const [a, b] = [...this.pointers.values()];
    this.userMoved = true;
    this.view.set(zoomAt(this.pinch.view, Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist, this.pinch.center));
    return true;
  }

  // --- tastiera e rinomina ---
  onKey(ev: KeyboardEvent): void {
    if (!this.interactive() || this.editing()) return;
    const t = ev.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const s = this.store;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod) {
      if (k === 'z') { ev.preventDefault(); if (ev.shiftKey) s.redo(); else s.undo(); }
      else if (k === 'y') { ev.preventDefault(); s.redo(); }
      else if (k === 'c') s.copy();
      else if (k === 'v') { ev.preventDefault(); s.paste(); }
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
      case 'Enter':
        if (s.tool() === 'isa') s.finishIsa();
        else if (s.selection().size === 1) this.startRenameById([...s.selection()][0]);
        return;
      case 'ArrowUp': ev.preventDefault(); s.nudge(0, -step); return;
      case 'ArrowDown': ev.preventDefault(); s.nudge(0, step); return;
      case 'ArrowLeft': ev.preventDefault(); s.nudge(-step, 0); return;
      case 'ArrowRight': ev.preventDefault(); s.nudge(step, 0); return;
    }
    switch (k) {
      case 'v': s.cancelTool(); break;
      case 'e': s.tool.set('entity'); break;
      case 'r': s.relationshipShortcut(); break;
      case 'a': s.attributeShortcut(); break;
      case 'g': s.startIsa(); break;
      case 'l': void s.autoLayout(); break;
    }
  }

  onDblClick(ev: MouseEvent, id: Id): void {
    ev.stopPropagation();
    this.startRenameById(id);
  }

  startRenameById(id: Id): void {
    if (!this.editable()) return;
    const d = this.store.diagram();
    const el = entityById(d, id) ?? relationshipById(d, id);
    const attr = el ? undefined : findAttribute(d, id);
    const part = el || attr ? undefined : findPart(d, id);
    const partView = part ? this.scene().attributes.find((a) => a.id === part.attribute.id)?.composite?.parts.find((p) => p.id === id) : undefined;
    const at = el ? el.pos : partView ? partView.geom.label : this.scene().attributes.find((a) => a.id === id)?.geom.label;
    const name = el?.name ?? attr?.attribute.name ?? part?.part.name;
    if (!at || name === undefined) return;
    const p = this.toScreen(at);
    this.editing.set({ id, x: p.x, y: p.y, value: name, attr: !el });
  }

  commitRename(value: string): void {
    const ed = this.editing();
    if (!ed) return;
    this.editing.set(null);
    if (value.trim() !== ed.value.trim()) this.store.apply((d) => rename(d, ed.id, value));
  }
}
