import { z } from 'zod';
import { describeIssue, erdrawerSchema, fromErdrawer, isErdrawer } from './erdrawer';
import { newId } from './ids';
import { Diagram } from './model';

// Limiti dello schema ER: da questi derivano quelli dello schema logico, che generateLogical deve poter rispettare.
const ER_NAME_MAX = 80;
const ER_ATTRIBUTES_MAX = 200;
const ER_PARTS_MAX = 20;
const ER_ENTITIES_MAX = 500;
const ER_RELATIONSHIPS_MAX = 500;
const ER_GENERALIZATIONS_MAX = 200;

/**
 * Nomi derivati come «<attributo>_<parte>», «<tabella>_<attributo>», «<colonna>_<entita'>» superano gli 80 caratteri
 * (almeno 2 * ER_NAME_MAX + 1, piu' i suffissi «_2» e le catene di identificazioni esterne): margine ampio.
 */
export const LOGICAL_NAME_MAX = 12 * ER_NAME_MAX + 40;
/** Una tabella per entita' e per ciascun suo attributo multivalore, piu' una per associazione. */
export const LOGICAL_TABLES_MAX = ER_ENTITIES_MAX * (1 + ER_ATTRIBUTES_MAX) + ER_RELATIONSHIPS_MAX;
/** Tutti gli attributi composti al massimo delle parti, piu' margine per chiavi esterne e discriminatori. */
export const LOGICAL_COLUMNS_MAX = ER_ATTRIBUTES_MAX * ER_PARTS_MAX + 2 * ER_RELATIONSHIPS_MAX;
/** Una FK per associazione (due se ricorsiva) e una per livello di gerarchia. */
export const LOGICAL_FKS_MAX = 2 * ER_RELATIONSHIPS_MAX + ER_GENERALIZATIONS_MAX;

const id = z.string().min(1).max(100);
const name = z.string().max(ER_NAME_MAX);
const point = z.object({ x: z.number(), y: z.number() });
const part = z.object({ id, name, card: z.enum(['1,1', '0,1']), type: z.string().max(20).optional() });
const attribute = z.object({
  id, name, card: z.enum(['1,1', '0,1', '1,N', '0,N']), type: z.string().max(20).optional(), angle: z.number(),
  parts: z.array(part).max(ER_PARTS_MAX).optional(),
});
const entity = z.object({
  id, name, pos: point, attributes: z.array(attribute).max(ER_ATTRIBUTES_MAX),
  primary: z.object({ attributeIds: z.array(id), externalVia: z.array(id) }).nullable(),
  alternates: z.array(z.array(id)),
});
const participant = z.object({
  entityId: id, role: z.string().max(40).optional(),
  min: z.union([z.literal(0), z.literal(1)]).nullable(), max: z.union([z.literal(1), z.literal('N'), z.number().int().min(2).max(1_000_000)]).nullable(),
});
const relationship = z.object({
  id, name, pos: point, participants: z.array(participant).max(4), attributes: z.array(attribute).max(ER_ATTRIBUTES_MAX), fkOn: id.optional(),
});
const generalization = z.object({
  id, parentId: id, childIds: z.array(id).min(1), total: z.boolean(), exclusive: z.boolean(),
  strategy: z.enum(['merge-up', 'merge-down', 'replace']).optional(),
});
const lname = z.string().max(LOGICAL_NAME_MAX);
const lcolumn = z.object({ id, name: lname, type: z.string().max(20), nullable: z.boolean() });
const lcolumnIds = z.array(id).max(LOGICAL_COLUMNS_MAX);
const lforeignKey = z.object({
  id, columnIds: lcolumnIds.min(1), refTableId: id, refColumnIds: lcolumnIds.min(1),
});
const ltable = z.object({
  id, name: lname, pos: point, columns: z.array(lcolumn).max(LOGICAL_COLUMNS_MAX), primaryKey: lcolumnIds,
  // UNIQUE a colonna singola (una per colonna) piu' quelle composte delle uno-a-uno
  uniques: z.array(lcolumnIds).max(LOGICAL_COLUMNS_MAX + ER_RELATIONSHIPS_MAX), foreignKeys: z.array(lforeignKey).max(LOGICAL_FKS_MAX),
  // un CHECK per livello di gerarchia, coi nomi dei figli come valori
  checks: z.array(z.object({ columnId: id, values: z.array(name).max(ER_ENTITIES_MAX) })).max(ER_GENERALIZATIONS_MAX),
});
export const diagramSchema = z.object({
  version: z.literal(1), id, title: z.string().max(120),
  entities: z.array(entity).max(ER_ENTITIES_MAX), relationships: z.array(relationship).max(ER_RELATIONSHIPS_MAX),
  generalizations: z.array(generalization).max(ER_GENERALIZATIONS_MAX),
  logical: z.object({ tables: z.array(ltable).max(LOGICAL_TABLES_MAX) }).optional(),
});

export type ParseResult =
  | { ok: true; diagram: Diagram; source: 'diagrammier' | 'erdrawer'; warnings: string[] }
  | { ok: false; error: string };

export function serializeDiagram(d: Diagram): string {
  return JSON.stringify(d, null, 2);
}

const distinct = (ids: string[]) => new Set(ids).size === ids.length;

function logicalReferencesOk(l: NonNullable<Diagram['logical']>): boolean {
  const tableIds = new Set(l.tables.map((t) => t.id));
  if (tableIds.size !== l.tables.length) return false;
  const fkIds = l.tables.flatMap((t) => t.foreignKeys.map((f) => f.id));
  if (!distinct(fkIds) || fkIds.some((f) => tableIds.has(f))) return false;
  const colsOf = new Map(l.tables.map((t) => [t.id, new Set(t.columns.map((c) => c.id))]));
  for (const t of l.tables) {
    const cols = colsOf.get(t.id)!;
    if (cols.size !== t.columns.length) return false;
    if (!distinct(t.primaryKey) || !t.primaryKey.every((c) => cols.has(c))) return false;
    if (!t.uniques.every((u) => distinct(u) && u.every((c) => cols.has(c)))) return false;
    if (!t.checks.every((ch) => cols.has(ch.columnId))) return false;
    for (const f of t.foreignKeys) {
      const ref = colsOf.get(f.refTableId);
      if (!ref || f.columnIds.length !== f.refColumnIds.length) return false;
      if (!distinct(f.columnIds) || !distinct(f.refColumnIds)) return false;
      if (!f.columnIds.every((c) => cols.has(c)) || !f.refColumnIds.every((c) => ref.has(c))) return false;
    }
  }
  return true;
}

function referencesOk(d: Diagram): boolean {
  const entities = new Set(d.entities.map((e) => e.id));
  const rels = new Set(d.relationships.map((r) => r.id));
  for (const e of d.entities) {
    const attrs = new Set(e.attributes.map((a) => a.id));
    if (e.primary && (!e.primary.attributeIds.every((a) => attrs.has(a)) || !e.primary.externalVia.every((r) => rels.has(r)))) return false;
    if (!e.alternates.every((s) => s.every((a) => attrs.has(a)))) return false;
  }
  for (const r of d.relationships) {
    if (!r.participants.every((p) => entities.has(p.entityId))) return false;
    if (r.fkOn && !entities.has(r.fkOn)) return false;
  }
  if (d.logical && !logicalReferencesOk(d.logical)) return false;
  return d.generalizations.every((g) => entities.has(g.parentId) && g.childIds.every((c) => entities.has(c)));
}

export function parseDiagramFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Il file non è JSON valido.' };
  }
  if (isErdrawer(raw)) {
    const parsedEr = erdrawerSchema.safeParse(raw);
    if (!parsedEr.success) {
      return { ok: false, error: describeIssue(parsedEr.error.issues[0]) };
    }
    try {
      const { diagram, warnings } = fromErdrawer(parsedEr.data);
      return { ok: true, diagram, source: 'erdrawer', warnings };
    } catch {
      return { ok: false, error: 'File erdrawer non leggibile: controlla che sia un file esportato da erdrawer.' };
    }
  }
  const parsed = diagramSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: describeIssue(parsed.error.issues[0]) };
  }
  const diagram = parsed.data as Diagram;
  if (!referencesOk(diagram)) {
    return { ok: false, error: 'File non valido: ci sono collegamenti verso elementi che non esistono.' };
  }
  return { ok: true, diagram: { ...diagram, id: newId() }, source: 'diagrammier', warnings: [] };
}
