import { z } from 'zod';
import { createDiagram } from './commands';
import { snapAngle } from './geometry';
import { newId } from './ids';
import { Attribute, Diagram, MaxCard } from './model';

interface ErAttr { uuid: string; name: string; isPrimaryKey?: boolean; circleX: number; circleY: number; parentUUID?: string }
interface ErEntity { uuid: string; name: string; x: number; y: number; width: number; height: number; composedKey?: boolean; isParent?: boolean; isChildren?: boolean; attributes?: ErAttr[] }
interface ErRel { uuid: string; name: string; rhombusX: number; rhombusY: number; entityUUIDs: string[]; cardinals?: string[]; attributes?: ErAttr[] }
interface ErIsa { parentUUID: string; childrenUUIDs: string[]; label?: string }

export interface ErdrawerProject {
  version?: number;
  entities: ErEntity[];
  relationships?: ErRel[];
  isaRelations?: ErIsa[];
}

export function isErdrawer(raw: unknown): raw is ErdrawerProject {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r['entities'])) return false;
  return 'isaRelations' in r || (r['entities'] as unknown[]).some((e) => typeof e === 'object' && e !== null && 'uuid' in e);
}

const erAttrSchema = z.object({
  uuid: z.string().min(1),
  name: z.string(),
  isPrimaryKey: z.boolean().optional(),
  circleX: z.number().finite(),
  circleY: z.number().finite(),
  parentUUID: z.string().optional(),
});
const erEntitySchema = z.object({
  uuid: z.string().min(1),
  name: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  composedKey: z.boolean().optional(),
  isParent: z.boolean().optional(),
  isChildren: z.boolean().optional(),
  attributes: z.array(erAttrSchema).max(200).optional(),
});
const erRelSchema = z.object({
  uuid: z.string().min(1),
  name: z.string(),
  rhombusX: z.number().finite(),
  rhombusY: z.number().finite(),
  entityUUIDs: z.array(z.string()),
  cardinals: z.array(z.string()).optional(),
  attributes: z.array(erAttrSchema).max(200).optional(),
});
const erIsaSchema = z.object({
  parentUUID: z.string().min(1),
  childrenUUIDs: z.array(z.string()),
  label: z.string().optional(),
});
/** Schema del formato erdrawer: valida prima di leggerlo, cosi' un file corrotto non produce dati sballati in silenzio. */
export const erdrawerSchema = z.object({
  version: z.number().optional(),
  entities: z.array(erEntitySchema).max(500),
  relationships: z.array(erRelSchema).max(500).optional(),
  isaRelations: z.array(erIsaSchema).max(200).optional(),
});

/** Messaggio in italiano per un problema di validazione zod, con il percorso del campo incriminato. */
export function describeIssue(issue: z.ZodIssue): string {
  let reason: string;
  switch (issue.code) {
    case 'invalid_type':
      reason = issue.message.endsWith('received undefined') ? 'campo mancante' : 'valore del tipo sbagliato';
      break;
    case 'too_big':
    case 'too_small':
      reason = 'troppi elementi o testo troppo lungo';
      break;
    case 'invalid_value':
      reason = 'valore non ammesso';
      break;
    default:
      reason = 'valore non valido';
  }
  return `File non valido: ${issue.path.join('.') || 'radice'} — ${reason}`;
}

export function parseErCard(s: string | undefined): { min: 0 | 1 | null; max: MaxCard | null } {
  const m = /^\s*\(?\s*([0-9nN])\s*[,;\s]\s*([0-9]{1,6}|[nN])\s*\)?\s*$/.exec(s ?? '');
  if (!m) return { min: null, max: null };
  const min = m[1] === '0' ? 0 : m[1] === '1' ? 1 : null;
  const n = Number(m[2]);
  const max = /[nN]/.test(m[2]) ? 'N' : n === 1 ? 1 : n >= 2 ? n : null;
  return { min, max };
}

export function fromErdrawer(p: ErdrawerProject): { diagram: Diagram; warnings: string[] } {
  const d = createDiagram('Importato da erdrawer');
  const warnings: string[] = [];
  const ids = new Map<string, string>();
  const idFor = (uuid: string) => {
    let v = ids.get(uuid);
    if (!v) {
      v = newId();
      ids.set(uuid, v);
    }
    return v;
  };
  const attrs = (list: ErAttr[] | undefined, cx: number, cy: number): Attribute[] =>
    (list ?? []).map((a) => ({
      id: idFor(a.uuid),
      name: String(a.name ?? '').trim(),
      card: '1,1',
      angle: snapAngle(Math.atan2(a.circleY - cy, a.circleX - cx)),
    }));

  for (const e of p.entities) {
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    const attributes = attrs(e.attributes, cx, cy);
    const keys = (e.attributes ?? []).filter((a) => a.isPrimaryKey).map((a) => ids.get(a.uuid)!);
    d.entities.push({
      id: idFor(e.uuid),
      name: String(e.name ?? '').trim(),
      pos: { x: cx, y: cy },
      attributes,
      primary: keys.length ? { attributeIds: keys, externalVia: [] } : null,
      alternates: [],
    });
  }
  const known = new Set(p.entities.map((e) => e.uuid));

  for (const r of p.relationships ?? []) {
    const parts = r.entityUUIDs.map((uuid, i) => ({ uuid, card: r.cardinals?.[i] })).filter((x) => known.has(x.uuid));
    if (parts.length < r.entityUUIDs.length) {
      warnings.push(`«${r.name}» puntava a entità che non ci sono più: controlla i suoi collegamenti.`);
    }
    d.relationships.push({
      id: idFor(r.uuid),
      name: String(r.name ?? '').trim(),
      pos: { x: r.rhombusX, y: r.rhombusY },
      participants: parts.map((x) => ({ entityId: ids.get(x.uuid)!, ...parseErCard(x.card) })),
      attributes: attrs(r.attributes, r.rhombusX, r.rhombusY),
    });
  }

  for (const isa of p.isaRelations ?? []) {
    const parentId = known.has(isa.parentUUID) ? ids.get(isa.parentUUID) : undefined;
    const childIds = isa.childrenUUIDs.filter((u) => known.has(u)).map((u) => ids.get(u)!);
    if (!parentId || !childIds.length) {
      warnings.push('Una gerarchia IS-A senza padre o figli è stata saltata.');
      continue;
    }
    const m = /\(\s*([TP])\s*,\s*([EO])\s*\)/i.exec(isa.label ?? '');
    d.generalizations.push({
      id: newId(),
      parentId,
      childIds,
      total: m ? m[1].toUpperCase() === 'T' : false,
      exclusive: m ? m[2].toUpperCase() === 'E' : true,
    });
  }
  return { diagram: d, warnings };
}
