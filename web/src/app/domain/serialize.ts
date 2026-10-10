import { z } from 'zod';
import { describeIssue, erdrawerSchema, fromErdrawer, isErdrawer } from './erdrawer';
import { newId } from './ids';
import { Diagram } from './model';

const id = z.string().min(1).max(100);
const name = z.string().max(80);
const point = z.object({ x: z.number(), y: z.number() });
const part = z.object({ id, name, card: z.enum(['1,1', '0,1']), type: z.string().max(20).optional() });
const attribute = z.object({
  id, name, card: z.enum(['1,1', '0,1', '1,N', '0,N']), type: z.string().max(20).optional(), angle: z.number(),
  parts: z.array(part).max(20).optional(),
});
const entity = z.object({
  id, name, pos: point, attributes: z.array(attribute).max(200),
  primary: z.object({ attributeIds: z.array(id), externalVia: z.array(id) }).nullable(),
  alternates: z.array(z.array(id)),
});
const participant = z.object({
  entityId: id, role: z.string().max(40).optional(),
  min: z.union([z.literal(0), z.literal(1)]).nullable(), max: z.union([z.literal(1), z.literal('N'), z.number().int().min(2).max(1_000_000)]).nullable(),
});
const relationship = z.object({
  id, name, pos: point, participants: z.array(participant).max(4), attributes: z.array(attribute).max(200), fkOn: id.optional(),
});
const generalization = z.object({
  id, parentId: id, childIds: z.array(id).min(1), total: z.boolean(), exclusive: z.boolean(),
  strategy: z.enum(['merge-up', 'merge-down', 'replace']).optional(),
});
export const diagramSchema = z.object({
  version: z.literal(1), id, title: z.string().max(120),
  entities: z.array(entity).max(500), relationships: z.array(relationship).max(500), generalizations: z.array(generalization).max(200),
});

export type ParseResult =
  | { ok: true; diagram: Diagram; source: 'diagrammier' | 'erdrawer'; warnings: string[] }
  | { ok: false; error: string };

export function serializeDiagram(d: Diagram): string {
  return JSON.stringify(d, null, 2);
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
