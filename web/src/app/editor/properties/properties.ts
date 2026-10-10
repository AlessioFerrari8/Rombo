import { Component, computed, inject, signal } from '@angular/core';
import {
  addAttribute, addAttributePart, addRelationship, deleteElements, rename, setAlternates, setExternalVia, setFkOn,
  toggleIdentifierAttribute, updateAttribute, updateGeneralization, updateParticipant, updatePart,
} from '../../domain/commands';
import {
  AttrCard, Entity, Generalization, Id, IsaStrategy, Participant, Relationship, entityById, findAttribute, findPart,
  generalizationById, relationshipById,
} from '../../domain/model';
import { EditorStore } from '../editor-store';
import { TypePicker } from '../type-picker/type-picker';

@Component({ selector: 'app-properties', templateUrl: './properties.html', imports: [TypePicker] })
export class Properties {
  protected readonly store = inject(EditorStore);
  protected readonly ro = this.store.readonly;
  protected readonly cards: Array<{ value: AttrCard; label: string }> = [
    { value: '1,1', label: '(1,1)' },
    { value: '0,1', label: '(0,1) opzionale' },
    { value: '1,N', label: '(1,N) multivalore' },
    { value: '0,N', label: '(0,N) multivalore' },
  ];
  protected readonly strategies: Array<{ value: IsaStrategy; label: string; help: string }> = [
    { value: 'merge-up', label: 'Figli nel padre', help: 'Una sola tabella con gli attributi di tutti e una colonna «Tipo».' },
    { value: 'merge-down', label: 'Padre nei figli', help: 'Una tabella per figlio, con anche gli attributi del padre. Solo se la gerarchia è totale.' },
    { value: 'replace', label: 'Associazioni', help: 'Una tabella per il padre e una per ogni figlio, collegate da chiave esterna.' },
  ];

  private readonly sel = computed(() => [...this.store.selection()]);
  private readonly single = computed(() => (this.sel().length === 1 ? this.sel()[0] : null));
  readonly entity = computed(() => {
    const id = this.single();
    return id ? entityById(this.store.diagram(), id) ?? null : null;
  });
  readonly relationship = computed(() => {
    const id = this.single();
    return id ? relationshipById(this.store.diagram(), id) ?? null : null;
  });
  readonly generalization = computed(() => {
    const id = this.single();
    return id ? generalizationById(this.store.diagram(), id) ?? null : null;
  });
  readonly attribute = computed(() => {
    const id = this.single();
    return id ? findAttribute(this.store.diagram(), id) ?? null : null;
  });
  readonly part = computed(() => {
    const id = this.single();
    return id ? findPart(this.store.diagram(), id) ?? null : null;
  });
  readonly selectedEntities = computed(() => this.sel().filter((id) => entityById(this.store.diagram(), id)));

  entityName(id: Id): string {
    return entityById(this.store.diagram(), id)?.name || 'senza nome';
  }
  otherEntities(g: Generalization): Entity[] {
    return this.store.diagram().entities.filter((e) => e.id !== g.parentId);
  }

  // --- attributi composti ---
  addPart(attrId: Id): void {
    this.store.apply((d) => addAttributePart(d, attrId).diagram);
  }
  setPartCard(partId: Id, optional: boolean): void {
    this.store.apply((d) => updatePart(d, partId, { card: optional ? '0,1' : '1,1' }));
  }
  setPartType(partId: Id, type: string): void {
    this.store.apply((d) => updatePart(d, partId, { type }));
  }

  // --- nomi, attributi ---
  renameEl(id: Id, value: string): void {
    this.store.apply((d) => rename(d, id, value));
  }
  addAttr(ownerId: Id): void {
    this.store.apply((d) => addAttribute(d, ownerId).diagram);
  }
  setCard(attrId: Id, card: string): void {
    this.store.apply((d) => updateAttribute(d, attrId, { card: card as AttrCard }));
  }
  setType(attrId: Id, type: string): void {
    this.store.apply((d) => updateAttribute(d, attrId, { type }));
  }
  remove(ids: Id[]): void {
    this.store.apply((d) => deleteElements(d, ids));
    this.store.selection.update((s) => new Set([...s].filter((x) => !ids.includes(x))));
  }
  select(id: Id): void {
    this.store.select([id]);
  }

  // --- identificatori ---
  isKey(e: Entity, attrId: Id): boolean {
    return e.primary?.attributeIds.includes(attrId) ?? false;
  }
  toggleKey(entityId: Id, attrId: Id): void {
    this.store.apply((d) => toggleIdentifierAttribute(d, entityId, attrId));
  }
  externalCandidates(e: Entity): Array<{ rel: Relationship; otherName: string; on: boolean; valid: boolean }> {
    return this.store.diagram().relationships
      .filter((r) => r.participants.length === 2 && r.participants.some((p) => p.entityId === e.id))
      .map((r) => {
        const mine = r.participants.find((p) => p.entityId === e.id)!;
        const other = r.participants.find((p) => p !== mine)!;
        return {
          rel: r,
          otherName: this.entityName(other.entityId),
          on: e.primary?.externalVia.includes(r.id) ?? false,
          valid: mine.min === 1 && mine.max === 1,
        };
      });
  }
  toggleExternal(e: Entity, relId: Id): void {
    const cur = e.primary?.externalVia ?? [];
    const next = cur.includes(relId) ? cur.filter((r) => r !== relId) : [...cur, relId];
    this.store.apply((d) => setExternalVia(d, e.id, next));
  }
  addAlternate(e: Entity): void {
    const first = e.attributes.find((a) => !this.isKey(e, a.id)) ?? e.attributes[0];
    if (first) this.store.apply((d) => setAlternates(d, e.id, [...e.alternates, [first.id]]));
  }
  toggleAlternate(e: Entity, index: number, attrId: Id): void {
    const sets = e.alternates.map((s, i) => (i !== index ? s : s.includes(attrId) ? s.filter((a) => a !== attrId) : [...s, attrId]));
    this.store.apply((d) => setAlternates(d, e.id, sets));
  }
  removeAlternate(e: Entity, index: number): void {
    this.store.apply((d) => setAlternates(d, e.id, e.alternates.filter((_, i) => i !== index)));
  }

  // --- associazioni ---
  setMin(relId: Id, i: number, v: string): void {
    this.store.apply((d) => updateParticipant(d, relId, i, { min: v === '0' ? 0 : 1 }));
  }
  /** Partecipazione su cui si sta scrivendo un massimo numerico non ancora confermato. */
  protected readonly numericDraft = signal<string | null>(null);
  isNumericMax(p: Participant): boolean {
    return typeof p.max === 'number' && p.max > 1;
  }
  setMax(relId: Id, i: number, v: string): void {
    if (v === 'num') {
      this.numericDraft.set(`${relId}:${i}`);
      return;
    }
    this.numericDraft.set(null);
    this.store.apply((d) => updateParticipant(d, relId, i, { max: v === 'N' ? 'N' : 1 }));
  }
  setMaxNumber(relId: Id, i: number, v: string): void {
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n) || n < 1) return;
    this.numericDraft.set(null);
    this.store.apply((d) => updateParticipant(d, relId, i, { max: n === 1 ? 1 : Math.min(n, 1_000_000) }));
  }
  setRole(relId: Id, i: number, v: string): void {
    this.store.apply((d) => updateParticipant(d, relId, i, { role: v }));
  }
  cardHelp(p: Participant): string {
    if (p.min === null || p.max === null) return 'Scegli minimo e massimo.';
    const min = p.min === 0 ? 'può anche non partecipare' : 'partecipa almeno una volta';
    const max = p.max === 1 ? 'al massimo una volta' : p.max === 'N' ? 'anche più volte' : `al massimo ${p.max} volte`;
    return `Ogni ${this.entityName(p.entityId)} ${min}, ${max}.`;
  }
  ambiguousOneToOne(r: Relationship): boolean {
    const [a, b] = r.participants;
    return r.participants.length === 2 && a.max === 1 && b.max === 1 && a.min === b.min && a.min !== null;
  }
  setFk(relId: Id, entityId: string): void {
    this.store.apply((d) => setFkOn(d, relId, entityId || undefined));
  }

  // --- generalizzazioni ---
  toggleChild(g: Generalization, id: Id): void {
    const next = g.childIds.includes(id) ? g.childIds.filter((c) => c !== id) : [...g.childIds, id];
    if (next.length) this.store.apply((d) => updateGeneralization(d, g.id, { childIds: next }));
  }
  setGen(g: Generalization, patch: Partial<Pick<Generalization, 'total' | 'exclusive' | 'strategy'>>): void {
    this.store.apply((d) => updateGeneralization(d, g.id, patch));
  }

  // --- piu' elementi ---
  relate(): void {
    const ents = this.selectedEntities();
    this.store.create((d) => addRelationship(d, ents));
  }
}
