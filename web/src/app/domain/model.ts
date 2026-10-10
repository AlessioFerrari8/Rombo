export type Id = string;

export interface Point {
  x: number;
  y: number;
}

/** Cardinalita' di un attributo: (1,1) normale, (0,1) opzionale, (x,N) multivalore. */
export type AttrCard = '1,1' | '0,1' | '1,N' | '0,N';

/** Parte di un attributo composto (via, n. civico, CAP di «indirizzo»). */
export interface AttributePart {
  id: Id;
  name: string;
  card: '1,1' | '0,1';
  type?: string;
}

export interface Attribute {
  id: Id;
  name: string;
  card: AttrCard;
  /** Tipo SQL; se manca vale DEFAULT_SQL_TYPE. */
  type?: string;
  /** Direzione (radianti) dal centro del proprietario verso il pallino. */
  angle: number;
  /** Se c'e', l'attributo e' composto: nello schema logico lo sostituiscono le sue parti. */
  parts?: AttributePart[];
}

export interface Identifier {
  attributeIds: Id[];
  /** Associazioni attraverso cui l'entita' e' identificata esternamente. */
  externalVia: Id[];
}

export interface Entity {
  id: Id;
  name: string;
  /** Centro del rettangolo. */
  pos: Point;
  attributes: Attribute[];
  primary: Identifier | null;
  /** Chiavi alternative: insiemi di id di attributi (diventano UNIQUE). */
  alternates: Id[][];
}

/** Massimo di una partecipazione: 1, N, oppure un numero preciso come il 25 di (1,25). */
export type MaxCard = 1 | 'N' | number;

export interface Participant {
  entityId: Id;
  role?: string;
  min: 0 | 1 | null;
  max: MaxCard | null;
}

export interface Relationship {
  id: Id;
  name: string;
  /** Centro del rombo. */
  pos: Point;
  participants: Participant[];
  attributes: Attribute[];
  /** Nell'uno-a-uno ambiguo: l'entita' che riceve la chiave esterna. */
  fkOn?: Id;
}

export type IsaStrategy = 'merge-up' | 'merge-down' | 'replace';

export interface Generalization {
  id: Id;
  parentId: Id;
  childIds: Id[];
  total: boolean;
  exclusive: boolean;
  strategy?: IsaStrategy;
}

export interface Diagram {
  version: 1;
  id: Id;
  title: string;
  entities: Entity[];
  relationships: Relationship[];
  generalizations: Generalization[];
}

export type Owner = Entity | Relationship;
export type ElementKind = 'entity' | 'relationship' | 'attribute' | 'part' | 'generalization';

export const SQL_TYPE_RE =
  /^(INT|BIGINT|TEXT|DATE|TIMESTAMP|BOOLEAN|VARCHAR\(\d{1,5}\)|CHAR\(\d{1,4}\)|DECIMAL\(\d{1,2},\d{1,2}\))$/;
export const DEFAULT_SQL_TYPE = 'VARCHAR(255)';

export function entityById(d: Diagram, id: Id): Entity | undefined {
  return d.entities.find((e) => e.id === id);
}

export function relationshipById(d: Diagram, id: Id): Relationship | undefined {
  return d.relationships.find((r) => r.id === id);
}

export function generalizationById(d: Diagram, id: Id): Generalization | undefined {
  return d.generalizations.find((g) => g.id === id);
}

export function findAttribute(d: Diagram, attrId: Id): { owner: Owner; attribute: Attribute } | undefined {
  for (const owner of [...d.entities, ...d.relationships]) {
    const attribute = owner.attributes.find((a) => a.id === attrId);
    if (attribute) return { owner, attribute };
  }
  return undefined;
}

export function findPart(d: Diagram, partId: Id): { owner: Owner; attribute: Attribute; part: AttributePart } | undefined {
  for (const owner of [...d.entities, ...d.relationships]) {
    for (const attribute of owner.attributes) {
      const part = attribute.parts?.find((p) => p.id === partId);
      if (part) return { owner, attribute, part };
    }
  }
  return undefined;
}

export function kindOf(d: Diagram, id: Id): ElementKind | null {
  if (entityById(d, id)) return 'entity';
  if (relationshipById(d, id)) return 'relationship';
  if (generalizationById(d, id)) return 'generalization';
  if (findAttribute(d, id)) return 'attribute';
  if (findPart(d, id)) return 'part';
  return null;
}

export function isRelationship(o: Owner): o is Relationship {
  return 'participants' in o;
}
