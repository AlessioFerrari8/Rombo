import { Diagram, Id, SQL_TYPE_RE, entityById, isRelationship, isWeak, relationshipById } from './model';

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'empty-name' | 'duplicate-name' | 'duplicate-attribute' | 'no-primary' | 'identifier-not-single'
  | 'too-few-participants' | 'missing-cardinality' | 'recursive-needs-roles'
  | 'identifying-not-binary' | 'weak-no-partial-key'
  | 'identifier-cycle' | 'isa-cycle' | 'isa-child-has-identifier' | 'invalid-sql-type' | 'merge-down-partial'
  | 'isolated-entity' | 'generic-relationship-name' | 'multivalued-attribute' | 'isa-default-strategy'
  | 'isa-mixed-strategies' | 'text-in-key' | 'name-too-long' | 'composite-one-part' | 'multivalued-composite'
  | 'duplicate-part' | 'weak-no-identifier'
  | 'empty-table-name' | 'empty-column-name' | 'duplicate-column' | 'invalid-identifier' | 'empty-table'
  | 'no-table-key' | 'nullable-key' | 'fk-target-not-key' | 'fk-type-mismatch';

export interface Issue {
  severity: Severity;
  code: IssueCode;
  message: string;
  targetIds: Id[];
}

const GENERIC_REL = /^(r\d*|rel\d*|associazione( \d+)?)$/i;

const q = (s: string | undefined) => `«${s?.trim() || 'senza nome'}»`;

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function validate(d: Diagram): Issue[] {
  const out: Issue[] = [];
  const err = (code: IssueCode, message: string, ...targetIds: Id[]) =>
    out.push({ severity: 'error', code, message, targetIds });
  const warn = (code: IssueCode, message: string, ...targetIds: Id[]) =>
    out.push({ severity: 'warning', code, message, targetIds });
  const nameOf = (id: Id) => entityById(d, id)?.name;
  const checkNameLength = (name: string, id: Id) => {
    const trimmed = name.trim();
    if (trimmed.length > 60) {
      err('name-too-long', `Il nome «${trimmed.slice(0, 20)}…» è troppo lungo per un database: al massimo 60 caratteri.`, id);
    }
  };

  // Nomi e attributi
  const byName = new Map<string, Id[]>();
  for (const el of [...d.entities, ...d.relationships]) {
    const rel = isRelationship(el);
    if (!el.name.trim()) {
      err('empty-name', `${rel ? "Un'associazione" : "Un'entità"} non ha nome: fai doppio clic per scriverlo.`, el.id);
    } else {
      const k = el.name.trim().toLowerCase();
      byName.set(k, [...(byName.get(k) ?? []), el.id]);
      checkNameLength(el.name, el.id);
    }
    const attrNames = new Map<string, Id[]>();
    for (const a of el.attributes) {
      if (!a.name.trim()) err('empty-name', `Un attributo di ${q(el.name)} non ha nome.`, a.id);
      else {
        const k = a.name.trim().toLowerCase();
        attrNames.set(k, [...(attrNames.get(k) ?? []), a.id]);
        checkNameLength(a.name, a.id);
      }
      if (a.type && !SQL_TYPE_RE.test(a.type)) {
        err('invalid-sql-type', `Il tipo «${a.type}» di ${q(a.name)} non è valido: scegline uno dalla lista.`, a.id);
      }
      if (a.parts?.length && a.card.endsWith('N')) {
        err('multivalued-composite', `${q(a.name)} è composto e multivalore: trasformalo in un'entità collegata a ${q(el.name)}.`, a.id);
      } else if (a.card.endsWith('N')) {
        warn('multivalued-attribute', `${q(a.name)} è multivalore: nello schema logico diventa una tabella a parte.`, a.id);
      }
      if (a.parts?.length === 1) {
        warn('composite-one-part', `${q(a.name)} ha una sola parte: un attributo composto ne raggruppa almeno due.`, a.id);
      }
      const partNames = new Map<string, Id[]>();
      for (const p of a.parts ?? []) {
        if (!p.name.trim()) err('empty-name', `Una parte di ${q(a.name)} non ha nome.`, p.id);
        else {
          const k = p.name.trim().toLowerCase();
          partNames.set(k, [...(partNames.get(k) ?? []), p.id]);
          checkNameLength(p.name, p.id);
        }
        if (p.type && !SQL_TYPE_RE.test(p.type)) {
          err('invalid-sql-type', `Il tipo «${p.type}» di ${q(p.name)} non è valido: scegline uno dalla lista.`, p.id);
        }
      }
      for (const ids of partNames.values()) {
        if (ids.length > 1) err('duplicate-part', `${q(a.name)} ha due parti con lo stesso nome.`, ...ids);
      }
    }
    for (const ids of attrNames.values()) {
      if (ids.length > 1) err('duplicate-attribute', `${q(el.name)} ha due attributi con lo stesso nome.`, ...ids);
    }
  }
  for (const ids of byName.values()) {
    if (ids.length > 1) {
      const name = nameOf(ids[0]) ?? relationshipById(d, ids[0])?.name;
      err('duplicate-name', `Il nome ${q(name)} è usato ${ids.length} volte: entità e associazioni devono avere nomi diversi.`, ...ids);
    }
  }

  // Limiti di MySQL: TEXT non può far parte di una chiave (identificatore o chiave alternativa).
  for (const e of d.entities) {
    const checkKeyType = (aid: Id) => {
      const a = e.attributes.find((x) => x.id === aid);
      if (a?.type === 'TEXT') {
        warn('text-in-key', `${q(a.name)} è TEXT e fa parte di una chiave di ${q(e.name)}: MySQL non lo accetta, scegli VARCHAR.`, a.id);
      }
    };
    if (e.primary) e.primary.attributeIds.forEach(checkKeyType);
    for (const alt of e.alternates) alt.forEach(checkKeyType);
  }

  // Identificatori
  const childOf = new Map<Id, Id>();
  for (const g of d.generalizations) for (const c of g.childIds) childOf.set(c, g.parentId);
  const extGraph = new Map<Id, Id[]>();
  for (const e of d.entities) {
    if (childOf.has(e.id)) {
      if (e.primary) {
        err('isa-child-has-identifier', `${q(e.name)} eredita l'identificatore da ${q(nameOf(childOf.get(e.id)!))}: togli il suo.`, e.id);
      }
      continue;
    }
    if (isWeak(e) && !e.primary?.externalVia.length) {
      err('weak-no-identifier', `${q(e.name)} è un'entità debole ma non ha l'associazione identificante: sceglila nel pannello Proprietà.`, e.id);
    }
    if (!e.primary) {
      err('no-primary', `${q(e.name)} non ha un identificatore: clicca il pallino di un attributo per sceglierlo.`, e.id);
      continue;
    }
    for (const aid of e.primary.attributeIds) {
      const a = e.attributes.find((x) => x.id === aid);
      if (a && a.card !== '1,1') {
        err('identifier-not-single', `${q(a.name)} fa parte dell'identificatore di ${q(e.name)}, quindi deve essere (1,1).`, a.id);
      }
      for (const p of a?.parts ?? []) {
        if (p.card !== '1,1') {
          err('identifier-not-single', `${q(p.name)} fa parte dell'identificatore di ${q(e.name)} (tramite ${q(a!.name)}), quindi non può essere opzionale.`, p.id);
        }
      }
    }
    const targets: Id[] = [];
    for (const rid of e.primary.externalVia) {
      const r = relationshipById(d, rid);
      const mine = r?.participants.find((p) => p.entityId === e.id);
      const other = r?.participants.find((p) => p !== mine);
      if (other) targets.push(other.entityId);
      if (!r || !mine) continue;
      // Associazione identificante: un'associazione binaria qualunque, con le cardinalita' che servono.
      if (r.participants.length !== 2) {
        err('identifying-not-binary', `${q(r.name)} identifica ${q(e.name)}: deve collegare solo due entità, ${q(e.name)} e il suo proprietario.`, e.id, rid);
        continue;
      }
      const owner = q(nameOf(other!.entityId));
      if (!e.primary.attributeIds.length && other!.max !== null && other!.max !== 1) {
        warn(
          'weak-no-partial-key',
          `Lo stesso ${owner} può comparire con più ${q(e.name)}: aggiungi all'identificatore di ${q(e.name)} una chiave parziale (es. un numero progressivo) che le distingua.`,
          e.id,
        );
      }
    }
    extGraph.set(e.id, targets);
  }
  for (const cycle of findCycles(extGraph)) {
    err('identifier-cycle', `Identificazione esterna circolare fra ${cycle.map((id) => q(nameOf(id))).join(', ')}: almeno una deve avere un identificatore tutto suo.`, ...cycle);
  }

  // Associazioni
  for (const r of d.relationships) {
    if (r.participants.length < 2) err('too-few-participants', `${q(r.name)} collega meno di due entità.`, r.id);
    for (const p of r.participants) {
      if (p.min === null || p.max === null) {
        err('missing-cardinality', `Manca la cardinalità di ${q(nameOf(p.entityId))} in ${q(r.name)}: sceglila nel pannello Proprietà.`, r.id);
      }
    }
    const counts = new Map<Id, number>();
    for (const p of r.participants) counts.set(p.entityId, (counts.get(p.entityId) ?? 0) + 1);
    for (const [eid, n] of counts) {
      if (n < 2) continue;
      const roles = r.participants.filter((p) => p.entityId === eid).map((p) => p.role?.trim().toLowerCase() ?? '');
      if (roles.some((x) => !x) || new Set(roles).size !== roles.length) {
        err('recursive-needs-roles', `${q(r.name)} collega ${q(nameOf(eid))} con se stessa: dai un ruolo diverso a ogni lato (es. «capo» e «sottoposto»).`, r.id);
      }
    }
    if (r.name.trim() && GENERIC_REL.test(r.name.trim())) {
      warn('generic-relationship-name', `${q(r.name)} è un nome generico: usa un verbo che descriva il legame (es. «possiede»).`, r.id);
    }
  }

  // Generalizzazioni
  const isaGraph = new Map<Id, Id[]>();
  for (const g of d.generalizations) {
    for (const c of g.childIds) isaGraph.set(c, [...(isaGraph.get(c) ?? []), g.parentId]);
    if (g.strategy === 'merge-down' && !g.total) {
      err('merge-down-partial', `La gerarchia di ${q(nameOf(g.parentId))} è parziale: non si può accorpare il padre nei figli, le istanze che non sono di nessun figlio andrebbero perse.`, g.id);
    }
    if (g.strategy === 'merge-down') {
      // il padre di un merge-down sparisce come tabella: qualunque altra gerarchia in cui
      // partecipa (come padre o come figlio) deve tradurlo allo stesso modo, altrimenti quella
      // gerarchia si aspetterebbe una tabella per lui che non esiste più.
      for (const other of d.generalizations) {
        if (other === g || other.strategy === 'merge-down') continue;
        const involved = other.parentId === g.parentId || other.childIds.includes(g.parentId);
        if (involved) {
          err(
            'isa-mixed-strategies',
            `La gerarchia di ${q(nameOf(g.parentId))} accorpa il padre nei figli, ma ${q(nameOf(g.parentId))} fa parte anche di un'altra gerarchia tradotta in modo diverso: usa la stessa strategia per tutte e due.`,
            g.id,
            other.id,
          );
        }
      }
    }
    if (!g.strategy) {
      warn('isa-default-strategy', `Per la gerarchia di ${q(nameOf(g.parentId))} non hai scelto come tradurla: uso «figli nel padre».`, g.id);
    }
  }
  for (const cycle of findCycles(isaGraph)) {
    err('isa-cycle', `Gerarchia circolare fra ${cycle.map((id) => q(nameOf(id))).join(', ')}.`, ...cycle);
  }

  // Entita' isolate
  if (d.entities.length > 1) {
    const linked = new Set<Id>([
      ...d.relationships.flatMap((r) => r.participants.map((p) => p.entityId)),
      ...d.generalizations.flatMap((g) => [g.parentId, ...g.childIds]),
    ]);
    for (const e of d.entities) {
      if (!linked.has(e.id)) warn('isolated-entity', `${q(e.name)} non è collegata a niente.`, e.id);
    }
  }

  return [...out.filter((i) => i.severity === 'error'), ...out.filter((i) => i.severity === 'warning')];
}

export function findCycles(graph: Map<Id, Id[]>): Id[][] {
  const cycles: Id[][] = [];
  const keys = new Set<string>();
  const state = new Map<Id, 1 | 2>();
  const stack: Id[] = [];
  const visit = (n: Id) => {
    state.set(n, 1);
    stack.push(n);
    for (const m of graph.get(n) ?? []) {
      if (state.get(m) === 1) {
        const cycle = stack.slice(stack.indexOf(m));
        const key = [...cycle].sort().join('|');
        if (!keys.has(key)) {
          keys.add(key);
          cycles.push(cycle);
        }
      } else if (!state.has(m)) {
        visit(m);
      }
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of graph.keys()) if (!state.has(n)) visit(n);
  return cycles;
}
