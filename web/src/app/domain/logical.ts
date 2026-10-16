import { Attribute, DEFAULT_SQL_TYPE, Diagram, Entity, Id, Participant, Relationship } from './model';

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
}

export interface ForeignKey {
  columns: string[];
  refTable: string;
  refColumns: string[];
}

export interface EnumCheck {
  column: string;
  values: string[];
}

export interface Table {
  name: string;
  sourceId: Id;
  columns: Column[];
  primaryKey: string[];
  uniques: string[][];
  foreignKeys: ForeignKey[];
  checks: EnumCheck[];
}

export interface LogicalSchema {
  tables: Table[];
  notes: string[];
}

export function ident(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!s) return 'X';
  return /^\d/.test(s) ? `T_${s}` : s;
}

/** Un discriminatore per ogni livello di gerarchia esclusiva risolto con "figli nel padre". */
interface Discriminator {
  exclusive: boolean;
  nullable: boolean;
  children: string[];
  /** Nome dell'entita' che era il padre a questo livello: usato per dare un nome distinto alla colonna. */
  parentName: string;
}

interface FlatEntity extends Entity {
  discriminators?: Discriminator[];
  /** Strategia "replace": la chiave e' quella del padre, ed e' anche chiave esterna verso di lui. */
  isaParent?: Id;
}

interface Key {
  cols: Column[];
  fks: ForeignKey[];
}

function optionalCard(a: Attribute): Attribute {
  const card = a.card === '1,1' ? '0,1' : a.card === '1,N' ? '0,N' : a.card;
  return { ...a, card };
}

/** Risolve le generalizzazioni: dopo, restano solo entita' e associazioni. */
function flatten(d: Diagram, notes: string[]): { entities: FlatEntity[]; relationships: Relationship[] } {
  let entities: FlatEntity[] = structuredClone(d.entities);
  let relationships: Relationship[] = structuredClone(d.relationships);
  const pending = [...d.generalizations];
  while (pending.length) {
    // "figli nel padre" e "replace" vanno risolti dal basso (il livello piu' profondo prima);
    // "padre nei figli" va risolto dall'alto, perche' duplica il padre nei figli prima che
    // questi ultimi vengano a loro volta risolti come padri di un livello ancora piu' sotto.
    const idx = pending.findIndex((g) => {
      const strategy = g.strategy ?? 'merge-up';
      return strategy === 'merge-down'
        ? !pending.some((o) => o !== g && o.childIds.includes(g.parentId))
        : !pending.some((o) => o !== g && g.childIds.includes(o.parentId));
    });
    const g = pending.splice(idx === -1 ? 0 : idx, 1)[0];
    const parent = entities.find((e) => e.id === g.parentId);
    const kids = g.childIds
      .map((id) => entities.find((e) => e.id === id))
      .filter((e): e is FlatEntity => !!e);
    if (!parent || !kids.length) {
      notes.push(`Gerarchia (${g.id}) non risolvibile: entita' coinvolte mancanti o gia' trasformate da un'altra gerarchia.`);
      continue;
    }
    const strategy = g.strategy ?? 'merge-up';

    if (strategy === 'merge-up') {
      for (const k of kids) parent.attributes.push(...k.attributes.map(optionalCard));
      // i discriminatori di un livello piu' sotto (gia' risolto) salgono insieme agli attributi,
      // cosi' non si perdono quando anche questo livello viene assorbito nel padre. Come per gli
      // attributi (optionalCard), diventano sempre nullable: una riga del padre che non e' di
      // questo ramo (es. non e' un Dipendente) non ha nemmeno un sotto-tipo da dichiarare.
      const inherited = kids.flatMap((k) => (k.discriminators ?? []).map((disc) => ({ ...disc, nullable: true })));
      parent.discriminators = [
        ...(parent.discriminators ?? []),
        ...inherited,
        { exclusive: g.exclusive, nullable: !g.total, children: kids.map((k) => k.name), parentName: parent.name },
      ];
      const kidIds = new Set(kids.map((k) => k.id));
      for (const r of relationships) {
        for (const p of r.participants) {
          if (kidIds.has(p.entityId)) {
            p.entityId = parent.id;
            p.min = 0;
          }
        }
        if (r.fkOn && kidIds.has(r.fkOn)) r.fkOn = parent.id;
      }
      entities = entities.filter((e) => !kidIds.has(e.id));
      // un nipote "replace" gia' risolto puntava a uno di questi figli: ora deve puntare al padre,
      // che e' l'entita' che lo contiene davvero dopo l'accorpamento.
      for (const e of entities) {
        if (e.isaParent && kidIds.has(e.isaParent)) e.isaParent = parent.id;
      }
      notes.push(`Gerarchia di «${parent.name}»: figli accorpati nel padre.`);
    } else if (strategy === 'merge-down') {
      const next: Relationship[] = [];
      const renameMap = new Map<Id, Id>();
      // relazioni duplicate per piu' di un figlio: chi le usa per identificarsi esternamente
      // (raccolto sotto) non puo' seguire tutte le copie, quindi usa quella del primo figlio.
      const ambiguous = new Map<Id, { relName: string; firstChildName: string }>();
      for (const r of relationships) {
        if (!r.participants.some((p) => p.entityId === parent.id)) {
          next.push(r);
          continue;
        }
        renameMap.set(r.id, `${r.id}@${kids[0].id}`);
        if (kids.length > 1) ambiguous.set(r.id, { relName: r.name, firstChildName: kids[0].name });
        for (const k of kids) {
          next.push({
            ...structuredClone(r),
            id: `${r.id}@${k.id}`,
            name: `${r.name}_${k.name}`,
            participants: r.participants.map((p) =>
              p.entityId === parent.id ? { ...p, entityId: k.id } : { ...p, min: 0 },
            ),
            fkOn: r.fkOn === parent.id ? k.id : r.fkOn,
          });
        }
      }
      relationships = next;
      const kidIds = new Set(kids.map((k) => k.id));
      const noted = new Set<Id>();
      for (const e of entities) {
        if (e.id === parent.id || kidIds.has(e.id) || !e.primary) continue;
        e.primary.externalVia = e.primary.externalVia.map((rid) => {
          // la nota va aggiunta solo quando il renameMap serve davvero a qualcuno, non ogni
          // volta che una relazione viene duplicata (la maggior parte non identifica nessuno).
          const info = ambiguous.get(rid);
          if (info && !noted.has(rid)) {
            noted.add(rid);
            notes.push(
              `«${info.relName}»: duplicata per ogni figlio della gerarchia di «${parent.name}»; chi si identifica tramite questa associazione userà la copia di «${info.firstChildName}».`,
            );
          }
          return renameMap.get(rid) ?? rid;
        });
      }
      for (const k of kids) {
        k.attributes = [...structuredClone(parent.attributes), ...k.attributes];
        k.primary = parent.primary
          ? {
              attributeIds: [...parent.primary.attributeIds],
              externalVia: parent.primary.externalVia.map((rid) => `${rid}@${k.id}`),
            }
          : null;
        k.alternates = parent.alternates.map((s) => [...s]);
        // i discriminatori del padre (es. da un'altra gerarchia sullo stesso padre) e quelli gia'
        // propri del figlio si UNISCONO: non deve sparire ne' l'uno ne' l'altro.
        k.discriminators = [...(parent.discriminators ?? []), ...(k.discriminators ?? [])];
      }
      entities = entities.filter((e) => e.id !== parent.id);
      notes.push(`Gerarchia di «${parent.name}»: padre accorpato nei figli.`);
    } else {
      for (const k of kids) k.isaParent = parent.id;
      notes.push(`Gerarchia di «${parent.name}»: figli collegati al padre con una chiave esterna.`);
    }
  }
  return { entities, relationships };
}

function uniqueCol(cols: Column[], name: string): string {
  return freeName(new Set(cols.map((c) => c.name.toLowerCase())), name);
}

/** taken: nomi gia' usati, in minuscolo. */
function freeName(taken: Set<string>, name: string): string {
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const n = `${name}_${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

function column(a: Attribute): Column {
  return { name: ident(a.name), type: a.type ?? DEFAULT_SQL_TYPE, nullable: a.card === '0,1' };
}

/**
 * Ristrutturazione degli attributi composti: ognuno e' sostituito dalle sue parti. Una parte che
 * collide con un altro attributo prende il prefisso del composto; se il composto e' opzionale lo
 * diventano tutte le parti; se era nell'identificatore, ci entrano tutte le parti.
 */
function expandComposites(d: Diagram): Diagram {
  const composite = (a: Attribute) => !!a.parts?.length && !a.card.endsWith('N');
  if (![...d.entities, ...d.relationships].some((o) => o.attributes.some(composite))) return d;
  const x = structuredClone(d);
  for (const owner of [...x.entities, ...x.relationships]) {
    const taken = new Set(owner.attributes.filter((a) => !composite(a)).map((a) => ident(a.name).toLowerCase()));
    const replaced = new Map<Id, Id[]>();
    const out: Attribute[] = [];
    for (const a of owner.attributes) {
      if (!composite(a)) {
        out.push(a);
        continue;
      }
      const ids: Id[] = [];
      for (const p of a.parts!) {
        let name = p.name;
        if (taken.has(ident(name).toLowerCase())) name = `${a.name}_${p.name}`;
        taken.add(ident(name).toLowerCase());
        out.push({ id: p.id, name, card: a.card === '0,1' ? '0,1' : p.card, type: p.type, angle: a.angle });
        ids.push(p.id);
      }
      replaced.set(a.id, ids);
    }
    owner.attributes = out;
    if ('primary' in owner) {
      const swap = (list: Id[]) => list.flatMap((id) => replaced.get(id) ?? [id]);
      if (owner.primary) owner.primary.attributeIds = swap(owner.primary.attributeIds);
      owner.alternates = owner.alternates.map(swap);
    }
  }
  return x;
}

export function toLogical(d: Diagram): LogicalSchema {
  const notes: string[] = [];
  const flat = flatten(expandComposites(d), notes);
  const byId = new Map(flat.entities.map((e) => [e.id, e]));
  const relById = new Map(flat.relationships.map((r) => [r.id, r]));
  const keyMemo = new Map<Id, Key>();
  const candidateName = (e: Entity) => ident(e.name);

  const tables: Table[] = [];
  const tableOf = new Map<Id, Table>();
  const newTable = (name: string, sourceId: Id): Table => {
    let n = name;
    for (let i = 2; tables.some((t) => t.name.toLowerCase() === n.toLowerCase()); i++) n = `${name}_${i}`;
    const t: Table = { name: n, sourceId, columns: [], primaryKey: [], uniques: [], foreignKeys: [], checks: [] };
    tables.push(t);
    return t;
  };
  // nomi (minuscoli) delle colonne di ogni tabella: rifare il Set a ogni colonna costa O(n^2) sulle tabelle grandi
  const takenOf = new Map<Table, Set<string>>();
  const addCol = (t: Table, c: Column): string => {
    let taken = takenOf.get(t);
    if (!taken) takenOf.set(t, (taken = new Set(t.columns.map((x) => x.name.toLowerCase()))));
    const name = freeName(taken, c.name);
    taken.add(name.toLowerCase());
    t.columns.push({ ...c, name });
    return name;
  };
  /** Nome REALE della tabella di un'entita' (dopo l'eventuale dedup): mai ident(nome) al volo,
   *  altrimenti una FK puo' finire per puntare a una tabella diversa da quella vera. */
  const tableName = (id: Id): string => tableOf.get(id)!.name;

  // Prima si riservano i nomi di tutte le tabelle-entita', cosi' le tabelle satellite/ponte create
  // dopo (multivalore, associazioni) non possono "rubare" un nome che serve a un'entita'.
  for (const e of flat.entities) {
    tableOf.set(e.id, newTable(candidateName(e), e.id));
  }

  const otherParticipant = (r: Relationship, entityId: Id): Participant | undefined => {
    const mine = r.participants.find((p) => p.entityId === entityId);
    return r.participants.find((p) => p !== mine);
  };

  const key = (e: FlatEntity, guard = new Set<Id>()): Key => {
    const memo = keyMemo.get(e.id);
    if (memo) return memo;
    if (guard.has(e.id)) throw new Error(`Identificazione circolare su «${e.name}»`);
    guard.add(e.id);
    const cols: Column[] = [];
    const fks: ForeignKey[] = [];
    if (e.isaParent) {
      const parent = byId.get(e.isaParent)!;
      const pk = key(parent, guard);
      cols.push(...pk.cols.map((c) => ({ ...c })));
      fks.push({ columns: pk.cols.map((c) => c.name), refTable: tableName(parent.id), refColumns: pk.cols.map((c) => c.name) });
    } else if (e.primary) {
      for (const aid of e.primary.attributeIds) {
        const a = e.attributes.find((x) => x.id === aid);
        if (a) cols.push({ ...column(a), name: uniqueCol(cols, ident(a.name)), nullable: false });
      }
      for (const rid of e.primary.externalVia) {
        const r = relById.get(rid);
        const other = r && otherParticipant(r, e.id);
        const oe = other && byId.get(other.entityId);
        if (!other || !oe) continue;
        const ok = key(oe, guard);
        const suffix = ident(other.role ?? oe.name);
        const names: string[] = [];
        for (const c of ok.cols) {
          const n = uniqueCol(cols, `${c.name}_${suffix}`);
          cols.push({ ...c, name: n, nullable: false });
          names.push(n);
        }
        fks.push({ columns: names, refTable: tableName(oe.id), refColumns: ok.cols.map((c) => c.name) });
      }
    }
    const k = { cols, fks };
    keyMemo.set(e.id, k);
    return k;
  };

  for (const e of flat.entities) {
    const t = tableOf.get(e.id)!;
    const k = key(e);
    t.primaryKey = k.cols.map((c) => addCol(t, c));
    t.foreignKeys.push(...k.fks);
    const keyAttrIds = new Set(e.isaParent ? [] : (e.primary?.attributeIds ?? []));
    const colNameByAttrId = new Map<Id, string>();
    // gli attributi dell'identificatore hanno gia' una colonna (in t.primaryKey, stesso ordine di
    // e.primary.attributeIds): serve comunque mapparli, altrimenti una chiave alternativa che ne
    // include uno (es. {CF, Email}) perde quella colonna nello UNIQUE.
    if (!e.isaParent) {
      (e.primary?.attributeIds ?? []).forEach((aid, i) => {
        const name = t.primaryKey[i];
        if (name !== undefined) colNameByAttrId.set(aid, name);
      });
    }
    for (const a of e.attributes) {
      if (keyAttrIds.has(a.id) || a.card.endsWith('N')) continue;
      colNameByAttrId.set(a.id, addCol(t, column(a)));
    }
    // il nome vero di una colonna e' quello uscito da addCol (puo' differire da ident(nome) per il dedup).
    t.uniques = e.alternates
      .map((s) => s.map((aid) => colNameByAttrId.get(aid)).filter((n): n is string => !!n))
      .filter((s) => s.length);
    for (const [i, disc] of (e.discriminators ?? []).entries()) {
      if (disc.exclusive) {
        const name = i === 0 ? 'Tipo' : `Tipo_${ident(disc.parentName)}`;
        const c = addCol(t, { name, type: 'VARCHAR(50)', nullable: disc.nullable });
        t.checks.push({ column: c, values: disc.children });
      } else {
        for (const child of disc.children) addCol(t, { name: `E_${ident(child)}`, type: 'BOOLEAN', nullable: false });
      }
    }
    for (const a of e.attributes.filter((x) => x.card.endsWith('N'))) {
      const mt = newTable(`${t.name}_${ident(a.name)}`, a.id);
      const fkCols = k.cols.map((c) => addCol(mt, { ...c, name: `${c.name}_${t.name}`, nullable: false }));
      const ac = addCol(mt, { name: ident(a.name), type: a.type ?? DEFAULT_SQL_TYPE, nullable: false });
      mt.primaryKey = [...fkCols, ac];
      mt.foreignKeys.push({ columns: fkCols, refTable: t.name, refColumns: k.cols.map((c) => c.name) });
    }
  }

  for (const r of flat.relationships) {
    if (r.participants.length < 2) continue;
    const ones = r.participants.filter((p) => p.max === 1);
    const singleAttrs = r.attributes.filter((a) => {
      if (!a.card.endsWith('N')) return true;
      notes.push(`L'attributo multivalore «${a.name}» di «${r.name}» non è tradotto: trasformalo in entità.`);
      return false;
    });

    // associazione identificante: qualunque cardinalita' abbia, la chiave del proprietario e' gia'
    // nella chiave primaria della debole (con la FK). La tabella della debole fa anche da tabella
    // dell'associazione: niente ponte nemmeno per un N:N, una riga per ogni coppia (debole, proprietario).
    const identified = r.participants.length === 2
      ? r.participants.find((p) => byId.get(p.entityId)?.primary?.externalVia.includes(r.id))
      : undefined;
    if (identified) {
      const owner = r.participants[r.participants.indexOf(identified) === 0 ? 1 : 0];
      const wt = tableOf.get(identified.entityId)!;
      // un proprietario con massimo 1 compare al piu' in una riga: la sua chiave e' anche UNIQUE
      if (owner.max === 1) {
        const fk = wt.foreignKeys.find((f) => f.refTable === tableName(owner.entityId));
        const samePk = fk && fk.columns.length === wt.primaryKey.length && fk.columns.every((c) => wt.primaryKey.includes(c));
        if (fk && !samePk) wt.uniques.push([...fk.columns]);
      }
      for (const a of singleAttrs) addCol(wt, { ...column(a), nullable: a.card === '0,1' });
      continue;
    }

    if (r.participants.length === 2 && ones.length > 0) {
      let holder: Participant;
      if (ones.length === 1) holder = ones[0];
      else {
        const mandatory = r.participants.filter((p) => p.min === 1);
        // ambigua solo se i due lati hanno lo stesso minimo: altrimenti la regola del lato (1,1)
        // basta da sola e fkOn (se impostato per un caso non ambiguo) va ignorato.
        const ambiguous = r.participants[0].min === r.participants[1].min;
        const chosen = ambiguous && r.fkOn ? r.participants.find((p) => p.entityId === r.fkOn) : undefined;
        holder = chosen ?? (mandatory.length === 1 ? mandatory[0] : r.participants[0]);
      }
      const target = r.participants[r.participants.indexOf(holder) === 0 ? 1 : 0];
      const he = byId.get(holder.entityId)!;
      const te = byId.get(target.entityId)!;
      const ht = tableOf.get(he.id)!;
      const optional = holder.min === 0;
      const tk = key(te);
      const suffix = ident(target.role ?? te.name);
      const cols = tk.cols.map((c) => addCol(ht, { ...c, name: `${c.name}_${suffix}`, nullable: optional }));
      ht.foreignKeys.push({ columns: cols, refTable: tableName(te.id), refColumns: tk.cols.map((c) => c.name) });
      if (ones.length === 2) ht.uniques.push(cols);
      for (const a of singleAttrs) addCol(ht, { ...column(a), nullable: optional || a.card === '0,1' });
      continue;
    }

    const bt = newTable(ident(r.name), r.id);
    const pk: string[] = [];
    for (const p of r.participants) {
      const e = byId.get(p.entityId)!;
      const k = key(e);
      const suffix = ident(p.role ?? e.name);
      const cols = k.cols.map((c) => addCol(bt, { ...c, name: `${c.name}_${suffix}`, nullable: false }));
      pk.push(...cols);
      bt.foreignKeys.push({ columns: cols, refTable: tableName(e.id), refColumns: k.cols.map((c) => c.name) });
    }
    bt.primaryKey = pk;
    if (r.participants.length > 2 && ones.length) {
      notes.push(`«${r.name}»: con più di due entità la chiave è l'insieme di tutte le chiavi esterne; restringila a mano se serve.`);
    }
    for (const a of singleAttrs) addCol(bt, column(a));
  }

  return { tables, notes };
}

export function formatLogical(s: LogicalSchema): string {
  const lines = s.tables.map((t) => {
    const cols = t.columns.map((c) => {
      let out = t.primaryKey.includes(c.name) ? `_${c.name}_` : c.name;
      const fk = t.foreignKeys.find((f) => f.columns.includes(c.name));
      if (fk) out += `→${fk.refTable.toUpperCase()}`;
      if (c.nullable) out += '*';
      return out;
    });
    return `${t.name.toUpperCase()}(${cols.join(', ')})`;
  });
  return [
    ...lines,
    '',
    'Legenda: _x_ chiave primaria · x→T chiave esterna verso T · x* può essere NULL',
    ...s.notes.map((n) => `Nota: ${n}`),
  ].join('\n');
}
