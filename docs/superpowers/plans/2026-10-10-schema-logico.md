# Editor dello schema logico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poter disegnare a mano lo schema logico relazionale dentro Rombo (tabelle, colonne, PK/FK, frecce), generarlo dall'ER, salvarlo nel `.rombo` e ottenerne notazione testuale e SQL.

**Architecture:** Un campo opzionale `logical` dentro `Diagram` (stesso file, stessa storia undo). Comandi puri sul `Diagram` come `commands.ts`. Un nuovo `LogicalCanvas` (SVG) e un pannello form `LogicalProperties` si attivano con l'interruttore ER | Logico in `EditorStore.mode`. Un adattatore `toTables` converte il modello a id nel `LogicalSchema` per nomi già esistente, così `formatLogical` e `toDDL` funzionano senza codice nuovo.

**Tech Stack:** Angular 22 (signals, standalone), TypeScript, zod 4, elkjs, vitest (`ng test`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-schema-logico-design.md`

## Global Constraints

- Tutto il codice sta in `web/src/app/` (app Angular copiata da DiagrammiER). **Non toccare** `electron/`, `test/` (guscio), né il flusso Firebase/server: resta tutto locale.
- `Diagram.version` resta `1`; `logical` è **opzionale**: un file senza `logical` deve restare valido e identico a oggi.
- Nessuna dipendenza npm nuova (ELK e zod ci sono già). CSP invariato (niente `eval`, niente stili inline dinamici oltre `[style.*]` già usati).
- Testi dell'interfaccia in **italiano**, identificatori nel codice in inglese/italiano come il resto (i commenti esistenti sono in italiano senza apostrofi accentati: `e'`, `puo'`).
- Le FK puntano a **id** (colonne e tabelle), mai a nomi. Invariante: `columnIds.length === refColumnIds.length >= 1`, imposto dai comandi e da `referencesOk`.
- Commit **Conventional**, un commit per task, **solo file mirati** (`git add <file...>`, mai `git add .`/`-A`). **Nessun trailer di attribuzione AI** nei messaggi di commit (regola dell'utente, prevale su qualsiasi default).
- Test: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/<percorso>.spec.ts'`; suite intera: `npx ng test --watch=false` (≈ 20 s). Build: `npx ng build`. La baseline all'inizio è **192 test web verdi**: non deve mai scendere.
- Lavoro sul branch `feat/schema-logico` (già creato). Non fare push né merge senza che l'utente lo chieda.

## Review Focus

Casi che la spec implica ma che nessun compito "felice" esercita; ognuno ha il suo test nel compito indicato.

1. **Eliminare una colonna usata in PK / UNIQUE / FK / CHECK** non lascia riferimenti pendenti: il diagramma risalvato passa `parseDiagramFile` (Task 2).
2. **Rinominare** tabella o colonna con FK attive: notazione e SQL usano i nomi nuovi, la FK non si rompe (Task 4).
3. **Nomi vuoti o duplicati** (tabelle, colonne): nessun crash, errore nel pannello Problemi, i pannelli Schema/SQL mostrano il callout invece di testo sbagliato (Task 5, 9).
4. **Rigenerare dall'ER con modifiche a mano**: chiede conferma; un solo `undo` ripristina lo schema a mano (Task 7, 10).
5. **FK impossibili** (tabella di destinazione senza PK, PK composta con colonne insufficienti): messaggio chiaro, nessuna FK invalida nel diagramma (Task 2, 7).

---

## File Structure

Nuovi file (tutti sotto `web/src/app/`):

| File | Responsabilità |
|---|---|
| `domain/logical-commands.ts` | Comandi puri su `Diagram.logical` (tabelle, colonne, PK, UNIQUE, FK, sostituzione). |
| `domain/logical-geometry.ts` | Rettangoli delle tabelle, centri delle righe, percorso delle frecce FK, bounds, hit-test. |
| `domain/logical-schema.ts` | `toTables` (id→nomi) e `generateLogical` (ER → modello modificabile). |
| `domain/validate-logical.ts` | `validateLogical`: problemi del modo Logico. |
| `domain/fixtures/logical.ts` | Fixture `buildNegozio()` per i test. |
| `editor/logical-layout.ts` | `computeLogicalLayout` con ELK. |
| `editor/logical-canvas/logical-canvas.{ts,html}` | Canvas SVG delle tabelle. |
| `editor/logical-properties/logical-properties.{ts,html}` | Form completo (percorso da tastiera). |
| `editor/regenerate-dialog/regenerate-dialog.{ts,html}` | Conferma prima di sostituire lo schema a mano. |
| `e2e/logical.spec.ts`, `e2e/fixtures/er-semplice.json` | Prove end-to-end. |

Modificati: `domain/model.ts`, `domain/serialize.ts`, `domain/commands.ts` (esporta `edit`), `domain/validate.ts` (nuovi `IssueCode`), `editor/editor-store.ts`, `editor/side-panel/*`, `editor/problems/*`, `editor/logical-panel/*`, `editor/sql-panel/*`, `editor/top-bar/*`, `editor/palette/*`, `pages/editor-page/*`, `styles.css`, `README.md` (radice).

---

### Task 1: Modello dati e persistenza nel file

**Files:**
- Modify: `web/src/app/domain/model.ts`
- Modify: `web/src/app/domain/serialize.ts`
- Test: `web/src/app/domain/serialize.spec.ts`

**Interfaces:**
- Produces (in `model.ts`):
  ```ts
  export interface LColumn { id: Id; name: string; type: string; nullable: boolean }
  export interface LForeignKey { id: Id; columnIds: Id[]; refTableId: Id; refColumnIds: Id[] }
  export interface LCheck { columnId: Id; values: string[] }
  export interface LTable {
    id: Id; name: string; pos: Point; columns: LColumn[]; primaryKey: Id[];
    uniques: Id[][]; foreignKeys: LForeignKey[]; checks: LCheck[];
  }
  export interface LogicalDiagram { tables: LTable[] }
  // Diagram gets:  logical?: LogicalDiagram;
  export function tableById(d: Diagram, id: Id): LTable | undefined;
  export function findForeignKey(d: Diagram, fkId: Id): { table: LTable; fk: LForeignKey } | undefined;
  export function logicalKindOf(d: Diagram, id: Id): 'table' | 'fk' | null;
  ```
- Produces (in `serialize.ts`): `diagramSchema` accetta `logical`; `parseDiagramFile` rifiuta riferimenti spezzati.

- [ ] **Step 1: Write the failing tests**

Aggiungi in fondo a `web/src/app/domain/serialize.spec.ts` (importa `Diagram` da `./model` in cima se non c'è già):

```ts
describe('parseDiagramFile con schema logico', () => {
  const logical = (): NonNullable<Diagram['logical']> => ({
    tables: [
      {
        id: 't1', name: 'Cliente', pos: { x: 0, y: 0 },
        columns: [{ id: 'c1', name: 'id', type: 'INT', nullable: false }],
        primaryKey: ['c1'], uniques: [], foreignKeys: [], checks: [],
      },
      {
        id: 't2', name: 'Ordine', pos: { x: 300, y: 0 },
        columns: [
          { id: 'c2', name: 'id', type: 'INT', nullable: false },
          { id: 'c3', name: 'cliente_id', type: 'INT', nullable: true },
        ],
        primaryKey: ['c2'], uniques: [['c3']],
        foreignKeys: [{ id: 'f1', columnIds: ['c3'], refTableId: 't1', refColumnIds: ['c1'] }],
        checks: [{ columnId: 'c3', values: ['a', 'b'] }],
      },
    ],
  });

  it('rilegge lo schema logico identico', () => {
    const d = { ...sample(), logical: logical() };
    const r = parseDiagramFile(serializeDiagram(d));
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.logical).toEqual(d.logical);
  });

  it('un file senza schema logico resta valido', () => {
    const r = parseDiagramFile(serializeDiagram(sample()));
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.logical).toBeUndefined();
  });

  it('rifiuta una FK verso una tabella che non esiste', () => {
    const l = logical();
    l.tables[1].foreignKeys[0].refTableId = 'nope';
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta una PK con una colonna che non esiste', () => {
    const l = logical();
    l.tables[0].primaryKey = ['zzz'];
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta una FK con numero di colonne diverso dalle riferite', () => {
    const l = logical();
    l.tables[1].foreignKeys[0].refColumnIds = ['c1', 'c1'];
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta id di tabella duplicati', () => {
    const l = logical();
    l.tables[1].id = 't1';
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });
});
```

Aggiungi l'import `import { Diagram } from './model';` in cima al file se manca.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/serialize.spec.ts'`
Expected: FAIL (errore di tipo su `logical` o `diagram.logical` `undefined` perché zod lo scarta).

- [ ] **Step 3: Implement**

In `model.ts`, dopo `Generalization` aggiungi i tipi `LColumn`, `LForeignKey`, `LCheck`, `LTable`, `LogicalDiagram` (come in **Interfaces**) e aggiungi a `Diagram` il campo:

```ts
  /** Schema logico modificabile a mano; assente nei diagrammi che non l'hanno mai generato. */
  logical?: LogicalDiagram;
```

In fondo a `model.ts` aggiungi:

```ts
export function tableById(d: Diagram, id: Id): LTable | undefined {
  return d.logical?.tables.find((t) => t.id === id);
}

export function findForeignKey(d: Diagram, fkId: Id): { table: LTable; fk: LForeignKey } | undefined {
  for (const table of d.logical?.tables ?? []) {
    const fk = table.foreignKeys.find((f) => f.id === fkId);
    if (fk) return { table, fk };
  }
  return undefined;
}

export function logicalKindOf(d: Diagram, id: Id): 'table' | 'fk' | null {
  if (tableById(d, id)) return 'table';
  if (findForeignKey(d, id)) return 'fk';
  return null;
}
```

In `serialize.ts`, prima di `diagramSchema` aggiungi:

```ts
const lcolumn = z.object({ id, name, type: z.string().max(20), nullable: z.boolean() });
const lforeignKey = z.object({
  id, columnIds: z.array(id).min(1).max(20), refTableId: id, refColumnIds: z.array(id).min(1).max(20),
});
const ltable = z.object({
  id, name, pos: point, columns: z.array(lcolumn).max(100), primaryKey: z.array(id).max(100),
  uniques: z.array(z.array(id).max(100)).max(100), foreignKeys: z.array(lforeignKey).max(100),
  checks: z.array(z.object({ columnId: id, values: z.array(z.string().max(80)).max(50) })).max(100),
});
```

e dentro `diagramSchema` aggiungi la riga `logical: z.object({ tables: z.array(ltable).max(300) }).optional(),`.

Prima di `referencesOk` aggiungi:

```ts
function logicalReferencesOk(l: NonNullable<Diagram['logical']>): boolean {
  const tableIds = new Set(l.tables.map((t) => t.id));
  if (tableIds.size !== l.tables.length) return false;
  const colsOf = new Map(l.tables.map((t) => [t.id, new Set(t.columns.map((c) => c.id))]));
  for (const t of l.tables) {
    const cols = colsOf.get(t.id)!;
    if (cols.size !== t.columns.length) return false;
    if (!t.primaryKey.every((c) => cols.has(c))) return false;
    if (!t.uniques.every((u) => u.every((c) => cols.has(c)))) return false;
    if (!t.checks.every((ch) => cols.has(ch.columnId))) return false;
    for (const f of t.foreignKeys) {
      const ref = colsOf.get(f.refTableId);
      if (!ref || f.columnIds.length !== f.refColumnIds.length) return false;
      if (!f.columnIds.every((c) => cols.has(c)) || !f.refColumnIds.every((c) => ref.has(c))) return false;
    }
  }
  return true;
}
```

e in `referencesOk`, prima dell'ultimo `return`, aggiungi `if (d.logical && !logicalReferencesOk(d.logical)) return false;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/serialize.spec.ts'`
Expected: PASS (tutti, vecchi e nuovi).

- [ ] **Step 5: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/domain/model.ts web/src/app/domain/serialize.ts web/src/app/domain/serialize.spec.ts
git commit -m "feat(domain): modello e persistenza dello schema logico nel file"
```

---

### Task 2: Comandi sullo schema logico

**Files:**
- Modify: `web/src/app/domain/commands.ts` (solo: `function edit` → `export function edit`)
- Create: `web/src/app/domain/logical-commands.ts`
- Create: `web/src/app/domain/fixtures/logical.ts`
- Test: `web/src/app/domain/logical-commands.spec.ts`

**Interfaces:**
- Consumes: `Created`, `edit` da `./commands`; `newId` da `./ids`; tipi e `tableById`, `findForeignKey` da `./model`.
- Produces (tutti puri: `(d: Diagram, ...) => Diagram | Created`; il diagramma di partenza non viene mutato):
  ```ts
  addTable(d, pos: Point, name?: string): Created
  renameTable(d, tableId: Id, name: string): Diagram
  moveTables(d, ids: Iterable<Id>, dx: number, dy: number): Diagram
  setTablePositions(d, positions: Record<Id, Point>): Diagram
  deleteTables(d, ids: Iterable<Id>): Diagram          // toglie anche le FK che puntano alle tabelle
  addColumn(d, tableId: Id, name?: string, type?: string): Created   // id '' se la tabella non esiste
  updateColumn(d, tableId: Id, colId: Id, patch: Partial<Pick<LColumn, 'name' | 'type' | 'nullable'>>): Diagram
  moveColumn(d, tableId: Id, colId: Id, delta: -1 | 1): Diagram
  deleteColumn(d, tableId: Id, colId: Id): Diagram     // pulisce PK/UNIQUE/CHECK/FK
  togglePrimaryKey(d, tableId: Id, colId: Id): Diagram // entrando in PK la colonna diventa NOT NULL
  toggleUnique(d, tableId: Id, colId: Id): Diagram     // UNIQUE a colonna singola
  removeUnique(d, tableId: Id, index: number): Diagram
  checkForeignKey(d, tableId: Id, columnIds: Id[], refTableId: Id): string | null  // messaggio di errore
  addForeignKey(d, tableId: Id, columnIds: Id[], refTableId: Id): Created  // id '' se checkForeignKey != null
  setForeignKeyColumns(d, tableId: Id, fkId: Id, columnIds: Id[]): Diagram
  deleteForeignKey(d, tableId: Id, fkId: Id): Diagram
  replaceLogical(d, l: LogicalDiagram): Diagram
  clearLogical(d): Diagram
  ```
  e la fixture `buildNegozio(): { d: Diagram; cliente: Id; ordine: Id; cId: Id; oId: Id; oCliente: Id; fk: Id }`: tabelle `Cliente(id PK INT, nome VARCHAR(80))` in (0,0) e `Ordine(id PK INT, cliente_id INT → Cliente.id)` in (400,0).

- [ ] **Step 1: Export `edit`**

In `web/src/app/domain/commands.ts` cambia `function edit(` in `export function edit(`.

- [ ] **Step 2: Write the failing tests**

Crea `web/src/app/domain/logical-commands.spec.ts`:

```ts
import { createDiagram } from './commands';
import { buildNegozio } from './fixtures/logical';
import {
  addColumn, addForeignKey, addTable, checkForeignKey, clearLogical, deleteColumn, deleteForeignKey, deleteTables,
  moveColumn, moveTables, removeUnique, renameTable, replaceLogical, setForeignKeyColumns, setTablePositions,
  toggleUnique, togglePrimaryKey, updateColumn,
} from './logical-commands';
import { parseDiagramFile, serializeDiagram } from './serialize';
import { tableById } from './model';

const valid = (d: Parameters<typeof serializeDiagram>[0]) => parseDiagramFile(serializeDiagram(d)).ok;

describe('comandi dello schema logico', () => {
  it('non modificano il diagramma di partenza', () => {
    const d0 = createDiagram();
    const { diagram } = addTable(d0, { x: 1, y: 2 });
    expect(d0.logical).toBeUndefined();
    expect(diagram.logical!.tables).toHaveLength(1);
  });

  it('danno nomi unici di default a tabelle e colonne', () => {
    let d = addTable(createDiagram(), { x: 0, y: 0 }).diagram;
    const t2 = addTable(d, { x: 0, y: 0 });
    d = t2.diagram;
    expect(d.logical!.tables.map((t) => t.name)).toEqual(['Tabella', 'Tabella_2']);
    d = addColumn(d, t2.id).diagram;
    d = addColumn(d, t2.id).diagram;
    expect(tableById(d, t2.id)!.columns.map((c) => c.name)).toEqual(['colonna', 'colonna_2']);
  });

  it('addColumn su una tabella che non esiste non fa niente', () => {
    const d = createDiagram();
    const r = addColumn(d, 'nope');
    expect(r.id).toBe('');
    expect(r.diagram).toBe(d);
  });

  it('rinomina e sposta le tabelle', () => {
    const { d, cliente, ordine } = buildNegozio();
    let x = renameTable(d, cliente, '  Persona ');
    expect(tableById(x, cliente)!.name).toBe('Persona');
    x = moveTables(x, [cliente, ordine], 16, 32);
    expect(tableById(x, cliente)!.pos).toEqual({ x: 16, y: 32 });
    expect(tableById(x, ordine)!.pos).toEqual({ x: 416, y: 32 });
    x = setTablePositions(x, { [cliente]: { x: 5, y: 6 } });
    expect(tableById(x, cliente)!.pos).toEqual({ x: 5, y: 6 });
    expect(tableById(x, ordine)!.pos).toEqual({ x: 416, y: 32 });
  });

  it('eliminare una tabella toglie le FK che puntano a lei', () => {
    const { d, cliente, ordine } = buildNegozio();
    const x = deleteTables(d, [cliente]);
    expect(x.logical!.tables).toHaveLength(1);
    expect(tableById(x, ordine)!.foreignKeys).toEqual([]);
    expect(valid(x)).toBe(true);
  });

  it('entrare nella PK rende la colonna NOT NULL; uscirne non la cambia', () => {
    const { d, cliente } = buildNegozio();
    const nome = tableById(d, cliente)!.columns[1].id;
    expect(tableById(d, cliente)!.columns[1].nullable).toBe(true);
    const x = togglePrimaryKey(d, cliente, nome);
    expect(tableById(x, cliente)!.primaryKey).toHaveLength(2);
    expect(tableById(x, cliente)!.columns[1].nullable).toBe(false);
    const y = togglePrimaryKey(x, cliente, nome);
    expect(tableById(y, cliente)!.primaryKey).toHaveLength(1);
    expect(tableById(y, cliente)!.columns[1].nullable).toBe(false);
  });

  it('aggiorna nome, tipo e nullabilita di una colonna', () => {
    const { d, ordine, oCliente } = buildNegozio();
    const x = updateColumn(d, ordine, oCliente, { name: 'idCliente', type: 'BIGINT', nullable: false });
    const c = tableById(x, ordine)!.columns[1];
    expect([c.name, c.type, c.nullable]).toEqual(['idCliente', 'BIGINT', false]);
  });

  it('riordina le colonne', () => {
    const { d, cliente, cId } = buildNegozio();
    const x = moveColumn(d, cliente, cId, 1);
    expect(tableById(x, cliente)!.columns.map((c) => c.name)).toEqual(['nome', 'id']);
    expect(moveColumn(x, cliente, cId, 1)).toEqual(x); // gia' ultima: non cambia
  });

  it('UNIQUE a colonna singola si accende e si spegne; quelle composte si tolgono per indice', () => {
    const { d, cliente } = buildNegozio();
    const nome = tableById(d, cliente)!.columns[1].id;
    let x = toggleUnique(d, cliente, nome);
    expect(tableById(x, cliente)!.uniques).toEqual([[nome]]);
    x = toggleUnique(x, cliente, nome);
    expect(tableById(x, cliente)!.uniques).toEqual([]);
    x = toggleUnique(x, cliente, nome);
    x = removeUnique(x, cliente, 0);
    expect(tableById(x, cliente)!.uniques).toEqual([]);
  });

  it('eliminare una colonna pulisce PK, UNIQUE, CHECK e FK (anche quelle che la riferiscono)', () => {
    const { d, cliente, ordine, cId, oCliente } = buildNegozio();
    let x = toggleUnique(d, ordine, oCliente);
    x = { ...x, logical: { tables: x.logical!.tables.map((t) => (t.id === ordine ? { ...t, checks: [{ columnId: oCliente, values: ['a'] }] } : t)) } };
    const noFk = deleteColumn(x, ordine, oCliente); // la colonna della FK
    expect(tableById(noFk, ordine)!.foreignKeys).toEqual([]);
    expect(tableById(noFk, ordine)!.uniques).toEqual([]);
    expect(tableById(noFk, ordine)!.checks).toEqual([]);
    expect(valid(noFk)).toBe(true);
    const noRef = deleteColumn(x, cliente, cId); // la colonna riferita da una FK e la PK di Cliente
    expect(tableById(noRef, cliente)!.primaryKey).toEqual([]);
    expect(tableById(noRef, ordine)!.foreignKeys).toEqual([]);
    expect(valid(noRef)).toBe(true);
  });

  it('addForeignKey usa la PK di destinazione e controlla numero di colonne', () => {
    const { d, cliente, ordine, cId, oId, oCliente } = buildNegozio();
    expect(checkForeignKey(d, ordine, [oCliente], cliente)).toBeNull();
    expect(checkForeignKey(d, ordine, [oCliente, oId], cliente)).toMatch(/1 colonna/);
    expect(checkForeignKey(d, ordine, [oCliente], 'nope')).toMatch(/non trovata/i);
    const senzaPk = togglePrimaryKey(d, cliente, cId); // Cliente resta senza PK
    expect(checkForeignKey(senzaPk, ordine, [oCliente], cliente)).toMatch(/chiave primaria/);
    const bad = addForeignKey(senzaPk, ordine, [oCliente], cliente);
    expect(bad.id).toBe('');
    expect(bad.diagram).toBe(senzaPk);
    const ok = addForeignKey(d, ordine, [oId], cliente);
    expect(ok.id).not.toBe('');
    const fk = tableById(ok.diagram, ordine)!.foreignKeys.at(-1)!;
    expect(fk.refColumnIds).toEqual([cId]);
    expect(valid(ok.diagram)).toBe(true);
  });

  it('cambia le colonne di una FK solo se il numero torna; la elimina', () => {
    const { d, ordine, oId, oCliente, fk } = buildNegozio();
    const x = setForeignKeyColumns(d, ordine, fk, [oId]);
    expect(tableById(x, ordine)!.foreignKeys[0].columnIds).toEqual([oId]);
    expect(setForeignKeyColumns(d, ordine, fk, [oId, oCliente])).toBe(d);
    expect(tableById(deleteForeignKey(d, ordine, fk), ordine)!.foreignKeys).toEqual([]);
  });

  it('replaceLogical e clearLogical', () => {
    const { d } = buildNegozio();
    expect(clearLogical(d).logical).toBeUndefined();
    const x = replaceLogical(createDiagram(), d.logical!);
    expect(x.logical!.tables).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/logical-commands.spec.ts'`
Expected: FAIL (moduli `./logical-commands` e `./fixtures/logical` non esistono).

- [ ] **Step 4: Implement**

Crea `web/src/app/domain/logical-commands.ts`:

```ts
import { Created, edit } from './commands';
import { newId } from './ids';
import { DEFAULT_SQL_TYPE, Diagram, Id, LColumn, LTable, LogicalDiagram, Point, tableById } from './model';

const MAX_NAME = 80;

function tablesOf(x: Diagram): LTable[] {
  return (x.logical ??= { tables: [] }).tables;
}

function table(x: Diagram, id: Id): LTable | undefined {
  return x.logical?.tables.find((t) => t.id === id);
}

/** Come uniqueName di commands.ts, ma con "_" (i nomi di tabella e colonna non hanno spazi). */
function uniqueIdent(taken: Iterable<string>, base: string): string {
  const set = new Set([...taken].map((n) => n.trim().toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}

const sameSet = (a: Id[], b: Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function addTable(d: Diagram, pos: Point, name?: string): Created {
  const id = newId();
  const diagram = edit(d, (x) => {
    const tables = tablesOf(x);
    tables.push({
      id, name: uniqueIdent(tables.map((t) => t.name), name?.trim().slice(0, MAX_NAME) || 'Tabella'), pos,
      columns: [], primaryKey: [], uniques: [], foreignKeys: [], checks: [],
    });
  });
  return { diagram, id };
}

export function renameTable(d: Diagram, tableId: Id, name: string): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (t) t.name = name.trim().slice(0, MAX_NAME);
  });
}

export function moveTables(d: Diagram, ids: Iterable<Id>, dx: number, dy: number): Diagram {
  const set = new Set(ids);
  return edit(d, (x) => {
    for (const t of x.logical?.tables ?? []) if (set.has(t.id)) t.pos = { x: t.pos.x + dx, y: t.pos.y + dy };
  });
}

export function setTablePositions(d: Diagram, positions: Record<Id, Point>): Diagram {
  return edit(d, (x) => {
    for (const t of x.logical?.tables ?? []) if (positions[t.id]) t.pos = positions[t.id];
  });
}

export function deleteTables(d: Diagram, ids: Iterable<Id>): Diagram {
  const gone = new Set(ids);
  return edit(d, (x) => {
    if (!x.logical) return;
    x.logical.tables = x.logical.tables.filter((t) => !gone.has(t.id));
    for (const t of x.logical.tables) t.foreignKeys = t.foreignKeys.filter((f) => !gone.has(f.refTableId));
  });
}

export function addColumn(d: Diagram, tableId: Id, name?: string, type: string = DEFAULT_SQL_TYPE): Created {
  if (!tableById(d, tableId)) return { diagram: d, id: '' };
  const id = newId();
  const diagram = edit(d, (x) => {
    const t = table(x, tableId)!;
    const col: LColumn = {
      id, name: uniqueIdent(t.columns.map((c) => c.name), name?.trim().slice(0, MAX_NAME) || 'colonna'), type, nullable: true,
    };
    t.columns.push(col);
  });
  return { diagram, id };
}

export function updateColumn(
  d: Diagram, tableId: Id, colId: Id, patch: Partial<Pick<LColumn, 'name' | 'type' | 'nullable'>>,
): Diagram {
  return edit(d, (x) => {
    const c = table(x, tableId)?.columns.find((col) => col.id === colId);
    if (!c) return;
    if (patch.name !== undefined) c.name = patch.name.trim().slice(0, MAX_NAME);
    if (patch.type !== undefined) c.type = patch.type;
    if (patch.nullable !== undefined) c.nullable = patch.nullable;
  });
}

export function moveColumn(d: Diagram, tableId: Id, colId: Id, delta: -1 | 1): Diagram {
  const t = tableById(d, tableId);
  const i = t?.columns.findIndex((c) => c.id === colId) ?? -1;
  const j = i + delta;
  if (!t || i < 0 || j < 0 || j >= t.columns.length) return d;
  return edit(d, (x) => {
    const cols = table(x, tableId)!.columns;
    [cols[i], cols[j]] = [cols[j], cols[i]];
  });
}

export function deleteColumn(d: Diagram, tableId: Id, colId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (!t) return;
    t.columns = t.columns.filter((c) => c.id !== colId);
    t.primaryKey = t.primaryKey.filter((c) => c !== colId);
    t.uniques = t.uniques.map((u) => u.filter((c) => c !== colId)).filter((u) => u.length);
    t.checks = t.checks.filter((ch) => ch.columnId !== colId);
    t.foreignKeys = t.foreignKeys.filter((f) => !f.columnIds.includes(colId));
    for (const other of x.logical!.tables) {
      other.foreignKeys = other.foreignKeys.filter((f) => !(f.refTableId === tableId && f.refColumnIds.includes(colId)));
    }
  });
}

export function togglePrimaryKey(d: Diagram, tableId: Id, colId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    const col = t?.columns.find((c) => c.id === colId);
    if (!t || !col) return;
    if (t.primaryKey.includes(colId)) t.primaryKey = t.primaryKey.filter((c) => c !== colId);
    else {
      t.primaryKey.push(colId);
      col.nullable = false;
    }
  });
}

export function toggleUnique(d: Diagram, tableId: Id, colId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (!t || !t.columns.some((c) => c.id === colId)) return;
    const i = t.uniques.findIndex((u) => sameSet(u, [colId]));
    if (i >= 0) t.uniques.splice(i, 1);
    else t.uniques.push([colId]);
  });
}

export function removeUnique(d: Diagram, tableId: Id, index: number): Diagram {
  return edit(d, (x) => {
    table(x, tableId)?.uniques.splice(index, 1);
  });
}

/** null se la FK si puo' creare, altrimenti il messaggio da mostrare. */
export function checkForeignKey(d: Diagram, tableId: Id, columnIds: Id[], refTableId: Id): string | null {
  const t = tableById(d, tableId);
  const r = tableById(d, refTableId);
  if (!t || !r) return 'Tabella non trovata.';
  const n = r.primaryKey.length;
  if (!n) return `«${r.name}» non ha una chiave primaria: sceglila prima.`;
  if (columnIds.length !== n) return `La chiave di «${r.name}» ha ${n} ${n === 1 ? 'colonna' : 'colonne'}: ne servono altrettante.`;
  if (new Set(columnIds).size !== n || !columnIds.every((c) => t.columns.some((x) => x.id === c))) return 'Colonne non valide.';
  return null;
}

export function addForeignKey(d: Diagram, tableId: Id, columnIds: Id[], refTableId: Id): Created {
  if (checkForeignKey(d, tableId, columnIds, refTableId)) return { diagram: d, id: '' };
  const id = newId();
  const diagram = edit(d, (x) => {
    const r = table(x, refTableId)!;
    table(x, tableId)!.foreignKeys.push({ id, columnIds: [...columnIds], refTableId, refColumnIds: [...r.primaryKey] });
  });
  return { diagram, id };
}

export function setForeignKeyColumns(d: Diagram, tableId: Id, fkId: Id, columnIds: Id[]): Diagram {
  const t = tableById(d, tableId);
  const fk = t?.foreignKeys.find((f) => f.id === fkId);
  if (!t || !fk || columnIds.length !== fk.refColumnIds.length) return d;
  if (new Set(columnIds).size !== columnIds.length || !columnIds.every((c) => t.columns.some((x) => x.id === c))) return d;
  return edit(d, (x) => {
    table(x, tableId)!.foreignKeys.find((f) => f.id === fkId)!.columnIds = [...columnIds];
  });
}

export function deleteForeignKey(d: Diagram, tableId: Id, fkId: Id): Diagram {
  return edit(d, (x) => {
    const t = table(x, tableId);
    if (t) t.foreignKeys = t.foreignKeys.filter((f) => f.id !== fkId);
  });
}

export function replaceLogical(d: Diagram, l: LogicalDiagram): Diagram {
  return edit(d, (x) => {
    x.logical = structuredClone(l);
  });
}

export function clearLogical(d: Diagram): Diagram {
  return edit(d, (x) => {
    delete x.logical;
  });
}
```

Crea `web/src/app/domain/fixtures/logical.ts`:

```ts
import { createDiagram } from '../commands';
import { addColumn, addForeignKey, addTable, togglePrimaryKey } from '../logical-commands';
import { Diagram, Id } from '../model';

/** Cliente(id PK, nome) e Ordine(id PK, cliente_id -> Cliente.id): il minimo con una FK. */
export function buildNegozio(): { d: Diagram; cliente: Id; ordine: Id; cId: Id; oId: Id; oCliente: Id; fk: Id } {
  let d = createDiagram('Negozio');
  const cliente = addTable(d, { x: 0, y: 0 }, 'Cliente');
  d = cliente.diagram;
  const cId = addColumn(d, cliente.id, 'id', 'INT');
  d = togglePrimaryKey(cId.diagram, cliente.id, cId.id);
  d = addColumn(d, cliente.id, 'nome', 'VARCHAR(80)').diagram;
  const ordine = addTable(d, { x: 400, y: 0 }, 'Ordine');
  d = ordine.diagram;
  const oId = addColumn(d, ordine.id, 'id', 'INT');
  d = togglePrimaryKey(oId.diagram, ordine.id, oId.id);
  const oCliente = addColumn(d, ordine.id, 'cliente_id', 'INT');
  d = oCliente.diagram;
  const fk = addForeignKey(d, ordine.id, [oCliente.id], cliente.id);
  return { d: fk.diagram, cliente: cliente.id, ordine: ordine.id, cId: cId.id, oId: oId.id, oCliente: oCliente.id, fk: fk.id };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/logical-commands.spec.ts'`
Expected: PASS. Se `eliminare una colonna ...` fallisce sul vincolo `valid(noRef)`, controlla che `deleteColumn` tolga le FK delle altre tabelle che riferiscono la colonna.

- [ ] **Step 6: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/domain/commands.ts web/src/app/domain/logical-commands.ts web/src/app/domain/fixtures/logical.ts web/src/app/domain/logical-commands.spec.ts
git commit -m "feat(domain): comandi per tabelle, colonne, chiavi e FK dello schema logico"
```

---

### Task 3: Geometria delle tabelle e delle frecce FK

**Files:**
- Create: `web/src/app/domain/logical-geometry.ts`
- Test: `web/src/app/domain/logical-geometry.spec.ts`

**Interfaces:**
- Consumes: `LTable`, `LogicalDiagram`, `Id`, `Point` da `./model`; `Bounds` da `./geometry`.
- Produces:
  ```ts
  export interface Rect { x: number; y: number; w: number; h: number }   // x,y = angolo alto-sinistra
  export const HEADER_H = 34; export const ROW_H = 26;
  export function tableRect(t: LTable): Rect
  export function rowY(t: LTable, index: number): number               // centro verticale della riga
  export interface FkEdge { id: Id; tableId: Id; refTableId: Id; points: Point[]; arrow: Point[] }
  export function fkEdges(l: LogicalDiagram): FkEdge[]
  export function logicalBounds(l: LogicalDiagram): Bounds | null
  export function tableAt(l: LogicalDiagram, p: Point): LTable | undefined   // la piu' in alto
  ```

- [ ] **Step 1: Write the failing test**

Crea `web/src/app/domain/logical-geometry.spec.ts`:

```ts
import { buildNegozio } from './fixtures/logical';
import { HEADER_H, ROW_H, fkEdges, logicalBounds, rowY, tableAt, tableRect } from './logical-geometry';
import { tableById } from './model';

describe('geometria dello schema logico', () => {
  it('la tabella ha larghezza minima 176 (multipla di 16) e altezza da intestazione e righe', () => {
    const { d, cliente } = buildNegozio();
    const r = tableRect(tableById(d, cliente)!);
    expect(r).toEqual({ x: 0, y: 0, w: 176, h: HEADER_H + 2 * ROW_H + 6 });
  });

  it('una tabella senza colonne ha comunque una riga di altezza', () => {
    const { d, cliente } = buildNegozio();
    const t = { ...tableById(d, cliente)!, columns: [] };
    expect(tableRect(t).h).toBe(HEADER_H + ROW_H + 6);
  });

  it('i nomi lunghi allargano la tabella', () => {
    const { d, cliente } = buildNegozio();
    const t = { ...tableById(d, cliente)!, name: 'UnNomeDiTabellaMoltoLungoDavvero' };
    expect(tableRect(t).w).toBeGreaterThan(176);
    expect(tableRect(t).w % 16).toBe(0);
  });

  it('rowY e il centro verticale della riga', () => {
    const { d, ordine } = buildNegozio();
    const t = tableById(d, ordine)!;
    expect(rowY(t, 0)).toBe(HEADER_H + ROW_H / 2);
    expect(rowY(t, 1)).toBe(HEADER_H + ROW_H + ROW_H / 2);
  });

  it('la freccia FK esce dal lato sinistro di Ordine e arriva al lato destro di Cliente', () => {
    const { d, fk } = buildNegozio();
    const [e] = fkEdges(d.logical!);
    expect(e.id).toBe(fk);
    expect(e.points[0]).toEqual({ x: 400, y: 73 });
    expect(e.points.at(-1)).toEqual({ x: 176, y: 47 });
    expect(e.points).toEqual([{ x: 400, y: 73 }, { x: 288, y: 73 }, { x: 288, y: 47 }, { x: 176, y: 47 }]);
    expect(e.arrow[0]).toEqual({ x: 176, y: 47 });
    expect(e.arrow[1].x).toBe(186);
  });

  it('tabelle che si sovrappongono in orizzontale: la freccia gira dal lato destro', () => {
    const { d, ordine } = buildNegozio();
    const l = { tables: d.logical!.tables.map((t) => (t.id === ordine ? { ...t, pos: { x: 100, y: 200 } } : t)) };
    const [e] = fkEdges(l);
    const out = Math.max(...e.points.map((p) => p.x));
    expect(out).toBeGreaterThan(276); // oltre il bordo destro della piu' larga + margine
    expect(e.points[0].x).toBe(tableRect(l.tables[1]).x + tableRect(l.tables[1]).w);
  });

  it('una FK verso una tabella che non c\'e\' (file corrotto) viene ignorata', () => {
    const { d, ordine } = buildNegozio();
    const l = { tables: d.logical!.tables.filter((t) => t.id === ordine) };
    expect(fkEdges(l)).toEqual([]);
  });

  it('bounds copre tutte le tabelle; vuoto = null', () => {
    const { d } = buildNegozio();
    const b = logicalBounds(d.logical!)!;
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(400 + tableRect(d.logical!.tables[1]).w);
    expect(logicalBounds({ tables: [] })).toBeNull();
  });

  it('tableAt trova la tabella sotto il punto (l\'ultima vince)', () => {
    const { d, cliente, ordine } = buildNegozio();
    expect(tableAt(d.logical!, { x: 10, y: 10 })!.id).toBe(cliente);
    expect(tableAt(d.logical!, { x: 410, y: 10 })!.id).toBe(ordine);
    expect(tableAt(d.logical!, { x: 250, y: 10 })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/logical-geometry.spec.ts'`
Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implement**

Crea `web/src/app/domain/logical-geometry.ts`:

```ts
import { Bounds } from './geometry';
import { Id, LTable, LogicalDiagram, Point } from './model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HEADER_H = 34;
export const ROW_H = 26;
const MIN_W = 176;
const SNAP = 16;
const GAP = 24;

/** x, y = angolo alto-sinistra. La larghezza segue il nome della tabella e la riga piu' larga. */
export function tableRect(t: LTable): Rect {
  const head = t.name.length * 9.5 + 40;
  const rows = t.columns.map((c) => 34 + c.name.length * 7.5 + 20 + c.type.length * 6.5 + 14);
  const w = Math.ceil(Math.max(MIN_W, head, ...rows) / SNAP) * SNAP;
  return { x: t.pos.x, y: t.pos.y, w, h: HEADER_H + Math.max(1, t.columns.length) * ROW_H + 6 };
}

export function rowY(t: LTable, index: number): number {
  return t.pos.y + HEADER_H + index * ROW_H + ROW_H / 2;
}

export interface FkEdge {
  id: Id;
  tableId: Id;
  refTableId: Id;
  /** Poligonale ortogonale dalla colonna della FK alla colonna riferita. */
  points: Point[];
  /** Punta (in cima), poi i due angoli della base. */
  arrow: Point[];
}

export function fkEdges(l: LogicalDiagram): FkEdge[] {
  const byId = new Map(l.tables.map((t) => [t.id, t]));
  const out: FkEdge[] = [];
  for (const t of l.tables) {
    for (const fk of t.foreignKeys) {
      const r = byId.get(fk.refTableId);
      if (!r) continue;
      const a = tableRect(t);
      const b = tableRect(r);
      const si = Math.max(0, t.columns.findIndex((c) => c.id === fk.columnIds[0]));
      const ri = r.columns.findIndex((c) => c.id === fk.refColumnIds[0]);
      const sy = rowY(t, si);
      const ey = ri < 0 ? b.y + HEADER_H / 2 : rowY(r, ri);
      let points: Point[];
      let into: 1 | -1;
      if (a.x + a.w + GAP <= b.x) {
        const mx = (a.x + a.w + b.x) / 2;
        points = [{ x: a.x + a.w, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: b.x, y: ey }];
        into = 1;
      } else if (b.x + b.w + GAP <= a.x) {
        const mx = (b.x + b.w + a.x) / 2;
        points = [{ x: a.x, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: b.x + b.w, y: ey }];
        into = -1;
      } else {
        const ox = Math.max(a.x + a.w, b.x + b.w) + 32;
        points = [{ x: a.x + a.w, y: sy }, { x: ox, y: sy }, { x: ox, y: ey }, { x: b.x + b.w, y: ey }];
        into = -1;
      }
      const tip = points[points.length - 1];
      const base = tip.x - into * 10;
      out.push({
        id: fk.id, tableId: t.id, refTableId: r.id, points,
        arrow: [tip, { x: base, y: tip.y - 5 }, { x: base, y: tip.y + 5 }],
      });
    }
  }
  return out;
}

export function logicalBounds(l: LogicalDiagram): Bounds | null {
  if (!l.tables.length) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of l.tables) {
    const r = tableRect(t);
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  }
  for (const e of fkEdges(l)) for (const p of e.points) {
    xs.push(p.x);
    ys.push(p.y);
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function tableAt(l: LogicalDiagram, p: Point): LTable | undefined {
  return [...l.tables].reverse().find((t) => {
    const r = tableRect(t);
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/logical-geometry.spec.ts'`
Expected: PASS. Se il test "sovrappongono" fallisce per la soglia `276`, ricalcola con `tableRect` (Cliente è larga 176, Ordine a x=100: bordo destro max = 100 + w(Ordine)) e correggi **la costante del test**, non la geometria.

- [ ] **Step 5: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/domain/logical-geometry.ts web/src/app/domain/logical-geometry.spec.ts
git commit -m "feat(domain): geometria di tabelle e frecce FK dello schema logico"
```

---

### Task 4: Adattatore verso lo schema per nomi e generazione dall'ER

**Files:**
- Create: `web/src/app/domain/logical-schema.ts`
- Test: `web/src/app/domain/logical-schema.spec.ts`

**Interfaces:**
- Consumes: `toLogical`, `LogicalSchema`, `Table` da `./logical`; `newId` da `./ids`; `tableRect` da `./logical-geometry`.
- Produces:
  ```ts
  export function toTables(l: LogicalDiagram): LogicalSchema                // id -> nomi; notes: []
  export function generateLogical(d: Diagram): LogicalDiagram               // richiede un ER senza errori; posizioni a griglia
  ```

- [ ] **Step 1: Write the failing test**

Crea `web/src/app/domain/logical-schema.spec.ts`:

```ts
import { toDDL } from './ddl';
import { buildCarrozzeria } from './fixtures/carrozzeria';
import { buildNegozio } from './fixtures/logical';
import { addAttribute, addEntity, createDiagram, setAlternates, toggleIdentifierAttribute } from './commands';
import { formatLogical, toLogical } from './logical';
import { renameTable, updateColumn } from './logical-commands';
import { generateLogical, toTables } from './logical-schema';
import { tableRect } from './logical-geometry';

describe('toTables', () => {
  it('converte id in nomi e mantiene PK, FK, UNIQUE e CHECK', () => {
    const { d, ordine, oCliente } = buildNegozio();
    const l = {
      tables: d.logical!.tables.map((t) =>
        t.id === ordine ? { ...t, uniques: [[oCliente]], checks: [{ columnId: oCliente, values: ['a', "b'c"] }] } : t),
    };
    const s = toTables(l);
    expect(s.notes).toEqual([]);
    const o = s.tables.find((t) => t.name === 'Ordine')!;
    expect(o.primaryKey).toEqual(['id']);
    expect(o.foreignKeys).toEqual([{ columns: ['cliente_id'], refTable: 'Cliente', refColumns: ['id'] }]);
    expect(o.uniques).toEqual([['cliente_id']]);
    expect(o.checks).toEqual([{ column: 'cliente_id', values: ['a', "b'c"] }]);
  });

  it('la notazione e il SQL seguono i nomi rinominati a mano', () => {
    let { d, cliente, ordine, oCliente } = buildNegozio();
    d = renameTable(d, cliente, 'Persona');
    d = updateColumn(d, ordine, oCliente, { name: 'persona_id' });
    const text = formatLogical(toTables(d.logical!)).split('\n');
    expect(text[0]).toBe('PERSONA(_id_, nome*)');
    expect(text[1]).toBe('ORDINE(_id_, persona_id→PERSONA*)');
    const sql = toDDL(toTables(d.logical!), 'postgres');
    expect(sql).toContain('FOREIGN KEY ("persona_id") REFERENCES "Persona" ("id")');
  });
});

describe('generateLogical', () => {
  it('da lo stesso SQL e la stessa notazione dello schema derivato (carrozzeria)', () => {
    const d = buildCarrozzeria();
    const derived = toLogical(d);
    const hand = toTables(generateLogical(d));
    expect(hand.tables).toHaveLength(derived.tables.length);
    for (const dialect of ['postgres', 'mysql'] as const) {
      expect(toDDL(hand, dialect)).toBe(toDDL(derived, dialect));
    }
    expect(formatLogical({ ...hand, notes: derived.notes })).toBe(formatLogical(derived));
  });

  it('mappa le chiavi alternative in UNIQUE', () => {
    let d = createDiagram();
    const e = addEntity(d, { x: 0, y: 0 }, 'Persona');
    d = e.diagram;
    const cf = addAttribute(d, e.id, 'CF');
    d = toggleIdentifierAttribute(cf.diagram, e.id, cf.id);
    const mail = addAttribute(d, e.id, 'Email');
    d = setAlternates(mail.diagram, e.id, [[mail.id]]);
    const t = toTables(generateLogical(d)).tables[0];
    expect(t.uniques).toEqual([['Email']]);
  });

  it('assegna id diversi a ogni chiamata e posizioni senza sovrapposizioni', () => {
    const d = buildCarrozzeria();
    const a = generateLogical(d);
    const b = generateLogical(d);
    expect(a.tables[0].id).not.toBe(b.tables[0].id);
    const rects = a.tables.map(tableRect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const p = rects[i];
        const q = rects[j];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('il risultato passa la validazione di riferimenti del file', async () => {
    const { parseDiagramFile, serializeDiagram } = await import('./serialize');
    const d = { ...buildCarrozzeria(), logical: generateLogical(buildCarrozzeria()) };
    expect(parseDiagramFile(serializeDiagram(d)).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/logical-schema.spec.ts'`
Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implement**

Crea `web/src/app/domain/logical-schema.ts`:

```ts
import { newId } from './ids';
import { LogicalSchema, Table, toLogical } from './logical';
import { tableRect } from './logical-geometry';
import { Diagram, Id, LTable, LogicalDiagram } from './model';

/** Dal modello a id (modificabile) allo schema per nomi che capiscono formatLogical e toDDL. */
export function toTables(l: LogicalDiagram): LogicalSchema {
  const byId = new Map(l.tables.map((t) => [t.id, t]));
  const names = (t: LTable, ids: Id[]) =>
    ids.map((id) => t.columns.find((c) => c.id === id)?.name).filter((n): n is string => n !== undefined);
  const tables: Table[] = l.tables.map((t) => ({
    name: t.name,
    sourceId: t.id,
    columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
    primaryKey: names(t, t.primaryKey),
    uniques: t.uniques.map((u) => names(t, u)).filter((u) => u.length),
    foreignKeys: t.foreignKeys.flatMap((f) => {
      const r = byId.get(f.refTableId);
      return r ? [{ columns: names(t, f.columnIds), refTable: r.name, refColumns: names(r, f.refColumnIds) }] : [];
    }),
    checks: t.checks.flatMap((ch) => {
      const column = names(t, [ch.columnId])[0];
      return column === undefined ? [] : [{ column, values: ch.values }];
    }),
  }));
  return { tables, notes: [] };
}

const PER_ROW = 3;
const SPACING = 64;

/** Copia modificabile dello schema derivato dall'ER (da usare solo con un ER senza errori). */
export function generateLogical(d: Diagram): LogicalDiagram {
  const schema = toLogical(d);
  const tableIds = new Map(schema.tables.map((t) => [t.name, newId()]));
  const tables: LTable[] = schema.tables.map((t) => {
    const cols = t.columns.map((c) => ({ id: newId(), name: c.name, type: c.type, nullable: c.nullable }));
    const ids = (names: string[]) => names.map((n) => cols.find((c) => c.name === n)!.id);
    return {
      id: tableIds.get(t.name)!,
      name: t.name,
      pos: { x: 0, y: 0 },
      columns: cols,
      primaryKey: ids(t.primaryKey),
      uniques: t.uniques.map(ids),
      foreignKeys: [],
      checks: t.checks.map((ch) => ({ columnId: ids([ch.column])[0], values: [...ch.values] })),
    };
  });
  schema.tables.forEach((t, i) => {
    tables[i].foreignKeys = t.foreignKeys.map((f) => {
      const ref = tables.find((x) => x.id === tableIds.get(f.refTable))!;
      return {
        id: newId(),
        columnIds: f.columns.map((n) => tables[i].columns.find((c) => c.name === n)!.id),
        refTableId: ref.id,
        refColumnIds: f.refColumns.map((n) => ref.columns.find((c) => c.name === n)!.id),
      };
    });
  });
  // griglia provvisoria (il layout ELK la sostituisce subito dopo): righe alte quanto la tabella piu' alta
  let y = 32;
  for (let i = 0; i < tables.length; i += PER_ROW) {
    const row = tables.slice(i, i + PER_ROW);
    let x = 32;
    for (const t of row) {
      t.pos = { x, y };
      x += tableRect(t).w + SPACING;
    }
    y += Math.max(...row.map((t) => tableRect(t).h)) + SPACING;
  }
  return { tables };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/logical-schema.spec.ts'`
Expected: PASS. Se l'equivalenza SQL fallisce, il difetto è nella mappatura (ordine di colonne, FK o UNIQUE): correggi `generateLogical`, non il test.

- [ ] **Step 5: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/domain/logical-schema.ts web/src/app/domain/logical-schema.spec.ts
git commit -m "feat(domain): adattatore verso lo schema per nomi e generazione dall'ER"
```

---

### Task 5: Validazione dello schema logico

**Files:**
- Modify: `web/src/app/domain/validate.ts` (solo l'unione `IssueCode`)
- Create: `web/src/app/domain/validate-logical.ts`
- Test: `web/src/app/domain/validate-logical.spec.ts`

**Interfaces:**
- Consumes: `Issue`, `IssueCode` da `./validate`; `ident` da `./logical`; `SQL_TYPE_RE` da `./model`.
- Produces: `validateLogical(l: LogicalDiagram | undefined): Issue[]` (`targetIds` = id della tabella interessata).

- [ ] **Step 1: Add the new codes**

In `validate.ts` estendi `IssueCode` aggiungendo in coda (prima del `;`):

```ts
  | 'empty-table-name' | 'empty-column-name' | 'duplicate-column' | 'invalid-identifier' | 'empty-table'
  | 'no-table-key' | 'nullable-key' | 'fk-target-not-key' | 'fk-type-mismatch'
```

- [ ] **Step 2: Write the failing test**

Crea `web/src/app/domain/validate-logical.spec.ts`:

```ts
import { buildNegozio } from './fixtures/logical';
import { addColumn, addTable, deleteColumn, renameTable, togglePrimaryKey, updateColumn } from './logical-commands';
import { validateLogical } from './validate-logical';

const codes = (l: Parameters<typeof validateLogical>[0]) => validateLogical(l).map((i) => i.code);

describe('validateLogical', () => {
  it('senza schema o con lo schema del negozio: nessun problema', () => {
    expect(validateLogical(undefined)).toEqual([]);
    expect(validateLogical(buildNegozio().d.logical)).toEqual([]);
  });

  it('nome tabella vuoto, duplicato (senza badare alle maiuscole) e troppo lungo', () => {
    const { d, cliente, ordine } = buildNegozio();
    expect(codes(renameTable(d, cliente, '  ').logical)).toContain('empty-table-name');
    const dup = validateLogical(renameTable(d, ordine, 'CLIENTE').logical).find((i) => i.code === 'duplicate-name')!;
    expect(dup.severity).toBe('error');
    expect(dup.targetIds.sort()).toEqual([cliente, ordine].sort());
    expect(codes(renameTable(d, cliente, 'x'.repeat(61)).logical)).toContain('name-too-long');
  });

  it('nome che non e un identificatore SQL semplice: solo avviso', () => {
    const { d, cliente } = buildNegozio();
    const i = validateLogical(renameTable(d, cliente, 'Città vecchia').logical).find((x) => x.code === 'invalid-identifier')!;
    expect(i.severity).toBe('warning');
  });

  it('colonne: nome vuoto, duplicato nella stessa tabella, tipo non valido', () => {
    const { d, cliente, ordine, oCliente } = buildNegozio();
    const nome = d.logical!.tables[0].columns[1].id;
    expect(codes(updateColumn(d, cliente, nome, { name: '' }).logical)).toContain('empty-column-name');
    expect(codes(updateColumn(d, ordine, oCliente, { name: 'ID' }).logical)).toContain('duplicate-column');
    expect(codes(updateColumn(d, cliente, nome, { type: 'VARCHAR' }).logical)).toContain('invalid-sql-type');
  });

  it('avvisi: tabella vuota, senza PK, PK nullable', () => {
    const { d, cliente, cId } = buildNegozio();
    const vuota = addTable(d, { x: 0, y: 300 }, 'Vuota').diagram;
    expect(validateLogical(vuota.logical).find((i) => i.code === 'empty-table')!.severity).toBe('warning');
    const senzaPk = togglePrimaryKey(d, cliente, cId);
    expect(codes(senzaPk.logical)).toContain('no-table-key');
    const nullable = updateColumn(d, cliente, cId, { nullable: true });
    expect(codes(nullable.logical)).toContain('nullable-key');
  });

  it('FK che non punta alla PK o a un UNIQUE della destinazione e un errore', () => {
    const { d, cliente } = buildNegozio();
    const nome = d.logical!.tables[0].columns[1].id;
    const cambiata = togglePrimaryKey(togglePrimaryKey(d, cliente, d.logical!.tables[0].columns[0].id), cliente, nome);
    const i = validateLogical(cambiata.logical).find((x) => x.code === 'fk-target-not-key')!;
    expect(i.severity).toBe('error');
    expect(i.message).toContain('Ordine');
  });

  it('FK con tipi diversi dalla colonna riferita: avviso', () => {
    const { d, ordine, oCliente } = buildNegozio();
    const i = validateLogical(updateColumn(d, ordine, oCliente, { type: 'TEXT' }).logical).find((x) => x.code === 'fk-type-mismatch')!;
    expect(i.severity).toBe('warning');
  });

  it('una colonna eliminata non lascia problemi di riferimento', () => {
    const { d, ordine, oCliente } = buildNegozio();
    expect(validateLogical(deleteColumn(d, ordine, oCliente).logical)).toEqual([]);
    expect(addColumn(d, ordine).id).not.toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/validate-logical.spec.ts'`
Expected: FAIL (modulo mancante).

- [ ] **Step 4: Implement**

Crea `web/src/app/domain/validate-logical.ts`:

```ts
import { ident } from './logical';
import { Id, LTable, LogicalDiagram, SQL_TYPE_RE } from './model';
import { Issue, IssueCode } from './validate';

const q = (s: string) => `«${s.trim() || 'senza nome'}»`;
const same = (a: Id[], b: Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function validateLogical(l: LogicalDiagram | undefined): Issue[] {
  const out: Issue[] = [];
  if (!l) return out;
  const err = (code: IssueCode, message: string, ...targetIds: Id[]) => out.push({ severity: 'error', code, message, targetIds });
  const warn = (code: IssueCode, message: string, ...targetIds: Id[]) => out.push({ severity: 'warning', code, message, targetIds });
  const byId = new Map(l.tables.map((t) => [t.id, t]));

  const byName = new Map<string, LTable[]>();
  for (const t of l.tables) {
    const name = t.name.trim();
    if (!name) err('empty-table-name', 'Una tabella non ha un nome.', t.id);
    else {
      const key = name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), t]);
      if (name.length > 60) err('name-too-long', `Il nome ${q(name.slice(0, 20) + '…')} è troppo lungo per un database: al massimo 60 caratteri.`, t.id);
      else if (ident(name) !== name) {
        warn('invalid-identifier', `Il nome ${q(name)} non è un identificatore SQL semplice (lettere, cifre e _): nell'SQL verrà messo tra virgolette.`, t.id);
      }
    }
    if (!t.columns.length) warn('empty-table', `La tabella ${q(t.name)} non ha colonne.`, t.id);
    else if (!t.primaryKey.length) warn('no-table-key', `La tabella ${q(t.name)} non ha una chiave primaria.`, t.id);
    const nullableKey = t.columns.filter((c) => t.primaryKey.includes(c.id) && c.nullable);
    if (nullableKey.length) {
      warn('nullable-key', `Nella tabella ${q(t.name)} la chiave primaria ha colonne che possono essere NULL: ${nullableKey.map((c) => q(c.name)).join(', ')}.`, t.id);
    }

    const colNames = new Map<string, number>();
    for (const c of t.columns) {
      const name = c.name.trim();
      if (!name) {
        err('empty-column-name', `Una colonna di ${q(t.name)} non ha un nome.`, t.id);
        continue;
      }
      colNames.set(name.toLowerCase(), (colNames.get(name.toLowerCase()) ?? 0) + 1);
      if (name.length > 60) err('name-too-long', `Il nome ${q(name.slice(0, 20) + '…')} è troppo lungo per un database: al massimo 60 caratteri.`, t.id);
      else if (ident(name) !== name) {
        warn('invalid-identifier', `Il nome ${q(name)} (colonna di ${q(t.name)}) non è un identificatore SQL semplice: nell'SQL verrà messo tra virgolette.`, t.id);
      }
      if (!SQL_TYPE_RE.test(c.type)) err('invalid-sql-type', `Il tipo «${c.type}» della colonna ${q(name)} in ${q(t.name)} non è valido.`, t.id);
    }
    for (const [n, count] of colNames) {
      if (count > 1) err('duplicate-column', `Nella tabella ${q(t.name)} ci sono più colonne chiamate ${q(n)}.`, t.id);
    }

    for (const f of t.foreignKeys) {
      const r = byId.get(f.refTableId);
      if (!r) continue;
      if (!same(f.refColumnIds, r.primaryKey) && !r.uniques.some((u) => same(f.refColumnIds, u))) {
        err('fk-target-not-key', `La chiave esterna di ${q(t.name)} verso ${q(r.name)} non punta alla chiave primaria di ${q(r.name)}.`, t.id);
        continue;
      }
      const mismatch = f.columnIds.some((id, i) => {
        const a = t.columns.find((c) => c.id === id);
        const b = r.columns.find((c) => c.id === f.refColumnIds[i]);
        return a && b && a.type !== b.type;
      });
      if (mismatch) warn('fk-type-mismatch', `La chiave esterna di ${q(t.name)} verso ${q(r.name)} ha colonne di tipo diverso da quelle riferite.`, t.id);
    }
  }
  for (const group of byName.values()) {
    if (group.length > 1) err('duplicate-name', `Ci sono più tabelle chiamate ${q(group[0].name)}.`, ...group.map((t) => t.id));
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/domain/validate-logical.spec.ts'`
Expected: PASS. Poi `npx ng test --watch=false --include='src/app/domain/validate.spec.ts'` (l'unione `IssueCode` non deve rompere nulla).

- [ ] **Step 6: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/domain/validate.ts web/src/app/domain/validate-logical.ts web/src/app/domain/validate-logical.spec.ts
git commit -m "feat(domain): validazione dello schema logico"
```

---

### Task 6: Layout automatico delle tabelle (ELK)

**Files:**
- Create: `web/src/app/editor/logical-layout.ts`
- Test: `web/src/app/editor/logical-layout.spec.ts`

**Interfaces:**
- Consumes: `tableRect` da `../domain/logical-geometry`; `GRID` da `../domain/geometry`.
- Produces: `computeLogicalLayout(l: LogicalDiagram): Promise<Record<Id, Point>>` — posizioni **alto-sinistra** delle tabelle, arrotondate alla griglia.

- [ ] **Step 1: Write the failing test**

Crea `web/src/app/editor/logical-layout.spec.ts`:

```ts
import { buildCarrozzeria } from '../domain/fixtures/carrozzeria';
import { buildNegozio } from '../domain/fixtures/logical';
import { GRID } from '../domain/geometry';
import { generateLogical } from '../domain/logical-schema';
import { tableRect } from '../domain/logical-geometry';
import { setTablePositions } from '../domain/logical-commands';
import { computeLogicalLayout } from './logical-layout';

describe('computeLogicalLayout', () => {
  it('da una posizione a ogni tabella, sulla griglia e senza sovrapposizioni', async () => {
    const l = generateLogical(buildCarrozzeria());
    const pos = await computeLogicalLayout(l);
    expect(Object.keys(pos)).toHaveLength(l.tables.length);
    for (const p of Object.values(pos)) {
      expect(p.x % GRID).toBe(0);
      expect(p.y % GRID).toBe(0);
    }
    const placed = l.tables.map((t) => ({ ...t, pos: pos[t.id] }));
    const rects = placed.map(tableRect);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    }
  });

  it('mette la tabella che riferisce a sinistra di quella riferita', async () => {
    const { d, cliente, ordine } = buildNegozio();
    const pos = await computeLogicalLayout(d.logical!);
    expect(pos[ordine].x).toBeLessThan(pos[cliente].x);
    expect(setTablePositions(d, pos).logical!.tables).toHaveLength(2);
  });

  it('uno schema vuoto da un layout vuoto', async () => {
    expect(await computeLogicalLayout({ tables: [] })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/logical-layout.spec.ts'`
Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implement**

Crea `web/src/app/editor/logical-layout.ts`:

```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import { GRID } from '../domain/geometry';
import { tableRect } from '../domain/logical-geometry';
import { Id, LogicalDiagram, Point } from '../domain/model';

/** Chi riferisce sta a sinistra di chi e' riferito: le frecce FK vanno quasi sempre verso destra. */
export async function computeLogicalLayout(l: LogicalDiagram): Promise<Record<Id, Point>> {
  if (!l.tables.length) return {};
  const elk = new ELK();
  const children = l.tables.map((t) => {
    const r = tableRect(t);
    return { id: t.id, width: r.w, height: r.h };
  });
  const edges = l.tables.flatMap((t) =>
    t.foreignKeys.filter((f) => f.refTableId !== t.id).map((f) => ({ id: f.id, sources: [t.id], targets: [f.refTableId] })),
  );
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.separateConnectedComponents': 'true',
    },
    children,
    edges,
  });
  const out: Record<Id, Point> = {};
  for (const c of graph.children ?? []) {
    out[c.id] = { x: Math.round((c.x ?? 0) / GRID) * GRID, y: Math.round((c.y ?? 0) / GRID) * GRID };
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/logical-layout.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/editor/logical-layout.ts web/src/app/editor/logical-layout.spec.ts
git commit -m "feat(editor): layout automatico delle tabelle logiche con ELK"
```

---

### Task 7: Stato dell'editor: modo, problemi, schema, generazione, selezione

**Files:**
- Modify: `web/src/app/editor/editor-store.ts`
- Test: `web/src/app/editor/editor-store.spec.ts`

**Interfaces:**
- Consumes: tutto dei Task 1–6.
- Produces (su `EditorStore`):
  ```ts
  export type Mode = 'er' | 'logical';
  export type Tool = 'select' | 'entity' | 'relationship' | 'attribute' | 'isa' | 'table';   // 'table' nuovo
  readonly mode: WritableSignal<Mode>;
  readonly confirmRegenerate: WritableSignal<boolean>;
  readonly logicalIssues: Signal<Issue[]>;
  readonly activeIssues: Signal<Issue[]>;          // problemi del modo attivo
  readonly activeErrorCount: Signal<number>;
  readonly schema: Signal<LogicalSchema | null>;   // ER: quello derivato; Logico: toTables, null se ci sono errori
  setMode(m: Mode): void;                          // azzera selezione e strumento
  requestGenerate(): void;                         // conferma se esiste gia' uno schema, poi generateLogical()
  generateLogical(): Promise<void>;                // un solo passo di undo; toast se l'ER ha errori
  layoutLogical(): Promise<void>;                  // un solo passo di undo
  addForeignKeyFromColumn(tableId: Id, columnIndex: number, refTableId: Id): void;  // da drag; toast se impossibile
  ```
  `deleteSelection`, `nudge`, `selectAll`, `copy`, `paste`, `pruneSelection` si comportano in base al modo.

- [ ] **Step 1: Write the failing tests**

Aggiungi in `web/src/app/editor/editor-store.spec.ts` (nuovo `describe`, usa `setup()` già presente; importa ciò che manca):

```ts
import { buildNegozio } from '../domain/fixtures/logical';
import { tableById } from '../domain/model';
import { addTable } from '../domain/logical-commands';

describe('EditorStore: schema logico', () => {
  it('parte in modo ER e load riporta in modo ER', () => {
    const s = setup();
    s.load(createDiagram());
    s.setMode('logical');
    expect(s.mode()).toBe('logical');
    s.load(createDiagram());
    expect(s.mode()).toBe('er');
  });

  it('i problemi e lo schema seguono il modo attivo', () => {
    const s = setup();
    s.load(buildNegozio().d);
    expect(s.schema()!.tables).toHaveLength(0); // ER vuoto: nessuna tabella derivata
    s.setMode('logical');
    expect(s.activeErrorCount()).toBe(0);
    expect(s.schema()!.tables.map((t) => t.name)).toEqual(['Cliente', 'Ordine']);
    s.apply((d) => ({ ...d, logical: { tables: d.logical!.tables.map((t) => ({ ...t, name: '' })) } }));
    expect(s.activeErrorCount()).toBeGreaterThan(0);
    expect(s.schema()).toBeNull();
    s.setMode('er');
    expect(s.activeErrorCount()).toBe(0);
  });

  it('generateLogical crea lo schema in un solo passo di undo', async () => {
    const s = setup();
    s.load(buildCarrozzeria());
    await s.generateLogical();
    expect(s.diagram().logical!.tables).toHaveLength(5);
    expect(s.diagram().logical!.tables.every((t) => Number.isFinite(t.pos.x))).toBe(true);
    s.undo();
    expect(s.diagram().logical).toBeUndefined();
  });

  it('generateLogical con errori nell\'ER non crea niente', async () => {
    const s = setup();
    s.load(buildCarrozzeria());
    s.create((d) => addEntity(d, { x: 0, y: 0 }, 'Senza chiave'));
    await s.generateLogical();
    expect(s.diagram().logical).toBeUndefined();
  });

  it('requestGenerate chiede conferma se lo schema esiste gia', async () => {
    const s = setup();
    s.load(buildNegozio().d);
    s.requestGenerate();
    expect(s.confirmRegenerate()).toBe(true);
    s.confirmRegenerate.set(false);
    s.load(buildCarrozzeria());
    s.requestGenerate();
    expect(s.confirmRegenerate()).toBe(false);
    await vi.waitFor(() => expect(s.diagram().logical).toBeDefined());
  });

  it('rigenerare e poi annullare ripristina lo schema fatto a mano', async () => {
    const s = setup();
    const { d } = buildNegozio();
    s.load({ ...buildCarrozzeria(), logical: d.logical });
    await s.generateLogical();
    expect(s.diagram().logical!.tables).toHaveLength(5);
    s.undo();
    expect(s.diagram().logical!.tables.map((t) => t.name)).toEqual(['Cliente', 'Ordine']);
  });

  it('layoutLogical sposta le tabelle in un solo passo', async () => {
    const s = setup();
    s.load(buildNegozio().d);
    s.setMode('logical');
    await s.layoutLogical();
    const [c, o] = s.diagram().logical!.tables;
    expect(o.pos.x).toBeLessThan(c.pos.x);
    s.undo();
    expect(s.diagram().logical!.tables[0].pos).toEqual({ x: 0, y: 0 });
  });

  it('in modo Logico cancella, sposta e seleziona tabelle; undo vale per tutto', () => {
    const s = setup();
    const { d, cliente, ordine, fk } = buildNegozio();
    s.load(d);
    s.setMode('logical');
    s.selectAll();
    expect([...s.selection()].sort()).toEqual([cliente, ordine].sort());
    s.select([ordine]);
    s.nudge(16, 0);
    expect(tableById(s.diagram(), ordine)!.pos.x).toBe(416);
    s.select([fk]);
    s.deleteSelection();
    expect(tableById(s.diagram(), ordine)!.foreignKeys).toEqual([]);
    s.select([cliente]);
    s.deleteSelection();
    expect(s.diagram().logical!.tables).toHaveLength(1);
    s.undo();
    expect(s.diagram().logical!.tables).toHaveLength(2);
    s.undo();
    s.undo();
    expect(tableById(s.diagram(), ordine)!.foreignKeys).toHaveLength(1);
    expect(tableById(s.diagram(), ordine)!.pos.x).toBe(400);
  });

  it('undo toglie dalla selezione gli id che non esistono piu', () => {
    const s = setup();
    s.load(createDiagram());
    s.setMode('logical');
    const id = s.create((d) => addTable(d, { x: 0, y: 0 }));
    expect([...s.selection()]).toEqual([id]);
    s.undo();
    expect([...s.selection()]).toEqual([]);
  });

  it('addForeignKeyFromColumn crea la FK, o spiega perche no', () => {
    const s = setup();
    const { d, cliente, ordine, oId } = buildNegozio();
    s.load(d);
    s.setMode('logical');
    const idx = tableById(d, ordine)!.columns.findIndex((c) => c.id === oId);
    s.addForeignKeyFromColumn(ordine, idx, cliente);
    expect(tableById(s.diagram(), ordine)!.foreignKeys).toHaveLength(2);
    expect(s.selection().size).toBe(1);
    // PK da una colonna ma partendo dall'ultima riga: bastano le colonne disponibili
    const before = s.diagram();
    s.addForeignKeyFromColumn(cliente, 0, 'nope');
    expect(s.diagram()).toBe(before);
  });

  it('in modo Logico copia/incolla non fanno niente', () => {
    const s = setup();
    const { d, cliente } = buildNegozio();
    s.load(d);
    s.setMode('logical');
    s.select([cliente]);
    s.copy();
    s.paste();
    expect(s.diagram().logical!.tables).toHaveLength(2);
  });
});
```

Gli import `buildCarrozzeria`, `addEntity`, `createDiagram` esistono già nel file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/editor-store.spec.ts'`
Expected: FAIL (`setMode`, `mode`, ecc. non esistono).

- [ ] **Step 3: Implement**

In `editor-store.ts`:

1. Import da aggiungere:

```ts
import { Issue } from '../domain/validate';
import { validateLogical } from '../domain/validate-logical';
import { LogicalSchema, toLogical } from '../domain/logical';   // toLogical c'e' gia': unisci l'import
import { computeLogicalLayout } from './logical-layout';
import { generateLogical, toTables } from '../domain/logical-schema';
import {
  addForeignKey, checkForeignKey, deleteForeignKey, deleteTables, moveTables, replaceLogical, setTablePositions as setLogicalPositions,
} from '../domain/logical-commands';
// model.ts: aggiungi tableById, findForeignKey, logicalKindOf agli import esistenti
```

2. Tipi: `export type Tool = 'select' | 'entity' | 'relationship' | 'attribute' | 'isa' | 'table';` e `export type Mode = 'er' | 'logical';`.

3. Campi (dopo `readonly logical = computed(...)`):

```ts
  readonly mode = signal<Mode>('er');
  /** true mentre si chiede conferma prima di sostituire lo schema logico con uno nuovo. */
  readonly confirmRegenerate = signal(false);
  readonly logicalIssues = computed<Issue[]>(() => validateLogical(this.diagram().logical));
  readonly activeIssues = computed<Issue[]>(() => (this.mode() === 'logical' ? this.logicalIssues() : this.issues()));
  readonly activeErrorCount = computed(() => this.activeIssues().filter((i) => i.severity === 'error').length);
  /** Schema del modo attivo: derivato dall'ER, oppure quello fatto a mano. null se ha errori. */
  readonly schema = computed<LogicalSchema | null>(() => {
    if (this.mode() === 'er') return this.logical();
    if (this.logicalIssues().some((i) => i.severity === 'error')) return null;
    return toTables(this.diagram().logical ?? { tables: [] });
  });
```

4. In `load(...)` aggiungi `this.mode.set('er'); this.confirmRegenerate.set(false);`.

5. Metodi:

```ts
  setMode(m: Mode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.cancelTool();
    this.selection.set(new Set());
  }

  requestGenerate(): void {
    if (this.readonly()) return;
    if (this.diagram().logical?.tables.length) this.confirmRegenerate.set(true);
    else void this.generateLogical();
  }

  async generateLogical(): Promise<void> {
    if (this.readonly() || this.layingOut()) return;
    if (this.errorCount()) {
      this.toasts.show('error', `Correggi i ${this.errorCount()} errori del diagramma ER prima di generare lo schema logico.`);
      return;
    }
    const start = this.diagram();
    this.layingOut.set(true);
    try {
      const generated = generateLogical(start);
      const pos = await computeLogicalLayout(generated);
      if (this.diagram() !== start) return; // modificato nel frattempo: non sovrascrivo
      const placed = { tables: generated.tables.map((t) => ({ ...t, pos: pos[t.id] ?? t.pos })) };
      // apply() e' bloccato da locked() finche' layingOut() e' vero: scrivo la storia direttamente.
      this.history.update((h) => commit(h, replaceLogical(start, placed)));
      this.selection.set(new Set());
      this.scheduleSave();
      this.fitRequest.update((n) => n + 1);
    } catch {
      this.toasts.show('error', 'Non riesco a generare lo schema logico da questo diagramma.');
    } finally {
      this.layingOut.set(false);
    }
  }

  async layoutLogical(): Promise<void> {
    const start = this.diagram();
    if (this.readonly() || this.layingOut() || !start.logical?.tables.length) return;
    this.layingOut.set(true);
    try {
      const pos = await computeLogicalLayout(start.logical);
      if (this.diagram() !== start) return;
      this.history.update((h) => commit(h, setLogicalPositions(start, pos)));
      this.scheduleSave();
      this.fitRequest.update((n) => n + 1);
    } finally {
      this.layingOut.set(false);
    }
  }

  /** Trascinamento dalla maniglia di una colonna verso un'altra tabella: usa N colonne consecutive se la PK ne ha N. */
  addForeignKeyFromColumn(tableId: Id, columnIndex: number, refTableId: Id): void {
    const d = this.diagram();
    const t = tableById(d, tableId);
    const r = tableById(d, refTableId);
    if (!t || !r) return;
    const n = Math.max(1, r.primaryKey.length);
    const cols = t.columns.slice(columnIndex, columnIndex + n).map((c) => c.id);
    const err =
      r.primaryKey.length > 1 && cols.length < n
        ? `La chiave di «${r.name}» ha ${n} colonne: servono ${n} colonne da «${t.columns[columnIndex]?.name}» in poi.`
        : checkForeignKey(d, tableId, cols, refTableId);
    if (err) {
      this.toasts.show('error', err);
      return;
    }
    this.create((x) => addForeignKey(x, tableId, cols, refTableId));
  }
```

6. Metodi esistenti, in base al modo:

```ts
  selectAll(): void {
    const d = this.diagram();
    const ids = this.mode() === 'logical'
      ? (d.logical?.tables ?? [])
      : [...d.entities, ...d.relationships, ...d.generalizations];
    this.selection.set(new Set(ids.map((x) => x.id)));
  }

  deleteSelection(): void {
    if (this.locked()) return;
    const ids = [...this.selection()];
    if (!ids.length) return;
    if (this.mode() === 'logical') {
      const d = this.diagram();
      const tables = ids.filter((id) => tableById(d, id));
      const fks = ids.filter((id) => findForeignKey(d, id));
      this.apply((x) => {
        let n = deleteTables(x, tables);
        for (const id of fks) {
          const f = findForeignKey(n, id); // se la sua tabella e' sparita, la FK e' gia' andata
          if (f) n = deleteForeignKey(n, f.table.id, id);
        }
        return n;
      });
    } else {
      this.apply((d) => deleteElements(d, ids));
    }
    this.selection.set(new Set());
  }

  copy(): void {
    if (this.mode() === 'er' && this.selection().size) this.clipboard = copyElements(this.diagram(), this.selection());
  }

  paste(): void {
    if (this.locked() || this.mode() !== 'er') return;
    /* ...corpo esistente invariato... */
  }

  nudge(dx: number, dy: number): void {
    if (this.locked()) return;
    const d = this.diagram();
    if (this.mode() === 'logical') {
      const ids = [...this.selection()].filter((id) => tableById(d, id));
      if (ids.length) this.apply((x) => moveTables(x, ids, dx, dy));
      return;
    }
    /* ...corpo ER esistente invariato... */
  }
```

e `pruneSelection`:

```ts
    this.selection.update((s) => new Set([...s].filter((id) => kindOf(d, id) !== null || logicalKindOf(d, id) !== null)));
```

(Mantieni i corpi esistenti di `paste` e `nudge` dove indicato; modifica solo l'inizio come sopra.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/editor-store.spec.ts'`
Expected: PASS (nuovi e vecchi).

- [ ] **Step 5: Run the whole suite**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false`
Expected: tutti verdi (≥ 192 + i nuovi).

- [ ] **Step 6: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/editor/editor-store.ts web/src/app/editor/editor-store.spec.ts
git commit -m "feat(editor): modo ER/Logico, generazione e selezione dello schema logico nello store"
```

---

### Task 8: Canvas dello schema logico

**Files:**
- Create: `web/src/app/editor/logical-canvas/logical-canvas.ts`
- Create: `web/src/app/editor/logical-canvas/logical-canvas.html`
- Modify: `web/src/app/styles.css` (aggiungi in fondo al blocco "diagramma (SVG, notazione)", dopo la regola `.er-name-sm`)
- Test: `web/src/app/editor/logical-canvas/logical-canvas.spec.ts`

**Interfaces:**
- Consumes: `EditorStore` (Task 7), `fkEdges/tableRect/rowY/logicalBounds/tableAt/HEADER_H/ROW_H` (Task 3), comandi (Task 2), `View/fitView/centerOn/zoomAt/screenToWorld/worldToScreen` da `../../domain/viewport`.
- Produces: componente standalone `LogicalCanvas` (`selector: 'app-logical-canvas'`). Attributi di test: `[data-ltable="<nome>"]`, `[data-lcol="<nome>"]`, `.lg-fk` (una per freccia), `.lg-handle`; svg con `role="application"` e `aria-label="Schema logico"`. Registra `store.canvasSvg`.

- [ ] **Step 1: CSS**

In `styles.css`, subito dopo la riga `.er-name-sm { font-size: 14px; }`:

```css
/* schema logico: caselle delle tabelle */
.lg-head { fill: var(--er-rel); stroke: none; }
.lg-sep { stroke: var(--er-ink); stroke-width: 1.5; }
.lg-col { font-family: var(--font-sans); font-size: 13px; font-weight: 600; fill: var(--er-ink); dominant-baseline: central; }
.lg-col.is-pk { font-weight: 800; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
.lg-null { opacity: 0.6; }
.lg-type { font-family: var(--font-sans); font-size: 11.5px; font-weight: 600; fill: var(--er-ink); opacity: 0.6; text-anchor: end; dominant-baseline: central; }
.lg-icon { fill: none; stroke: var(--er-ink); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.lg-arrow { fill: var(--er-ink); stroke: var(--er-ink); stroke-width: 1; stroke-linejoin: round; }
.lg-handle { fill: var(--er-paper); stroke: var(--er-select); stroke-width: 2; cursor: crosshair; opacity: 0; }
.lg-table-g:hover .lg-handle, .lg-table-g.is-selected .lg-handle { opacity: 1; }
```

- [ ] **Step 2: Write the failing test**

Crea `web/src/app/editor/logical-canvas/logical-canvas.spec.ts`:

```ts
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildNegozio } from '../../domain/fixtures/logical';
import { tableById } from '../../domain/model';
import { EditorStore } from '../editor-store';
import { LogicalCanvas } from './logical-canvas';

@Component({ template: '<app-logical-canvas />', imports: [LogicalCanvas], providers: [EditorStore] })
class Host {
  readonly store = inject(EditorStore);
}

function render() {
  const f = TestBed.createComponent(Host);
  const n = buildNegozio();
  f.componentInstance.store.load(n.d);
  f.componentInstance.store.setMode('logical');
  f.detectChanges();
  return { f, el: f.nativeElement as HTMLElement, store: f.componentInstance.store, n };
}

function press(target: Element, type = 'pointerdown') {
  const Ctor = (globalThis.PointerEvent ?? MouseEvent) as typeof PointerEvent;
  target.dispatchEvent(new Ctor(type, { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }));
}

describe('LogicalCanvas', () => {
  it('disegna le tabelle, le colonne e le frecce FK', () => {
    const { el } = render();
    expect(el.querySelectorAll('[data-ltable]')).toHaveLength(2);
    expect(el.querySelector('[data-ltable="Ordine"]')!.querySelectorAll('[data-lcol]')).toHaveLength(2);
    expect(el.querySelectorAll('.lg-fk')).toHaveLength(1);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Schema logico');
  });

  it('la chiave primaria e sottolineata e la colonna opzionale ha l\'asterisco', () => {
    const { el } = render();
    const cliente = el.querySelector('[data-ltable="Cliente"]')!;
    expect(cliente.querySelector('[data-lcol="id"] .lg-col')!.classList.contains('is-pk')).toBe(true);
    expect(cliente.querySelector('[data-lcol="nome"]')!.textContent).toContain('*');
    expect(cliente.querySelector('[data-lcol="id"]')!.textContent).not.toContain('*');
  });

  it('clic su una tabella la seleziona; clic sul fondo deseleziona', () => {
    const { f, el, store, n } = render();
    press(el.querySelector('[data-ltable="Cliente"]')!);
    press(el.querySelector('[data-ltable="Cliente"]')!, 'pointerup');
    f.detectChanges();
    expect([...store.selection()]).toEqual([n.cliente]);
    expect(el.querySelector('[data-ltable="Cliente"] .er-selected')).not.toBeNull();
    press(el.querySelector('svg')!);
    press(el.querySelector('svg')!, 'pointerup');
    expect(store.selection().size).toBe(0);
  });

  it('clic su una freccia seleziona la FK', () => {
    const { el, store, n } = render();
    press(el.querySelector('.lg-fk')!);
    press(el.querySelector('.lg-fk')!, 'pointerup');
    expect([...store.selection()]).toEqual([n.fk]);
  });

  it('doppio clic sul nome della tabella la rinomina', () => {
    const { f, el, store, n } = render();
    el.querySelector('[data-ltable="Cliente"] .er-name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    f.detectChanges();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Nome"]')!;
    input.value = 'Persona';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.detectChanges();
    expect(tableById(store.diagram(), n.cliente)!.name).toBe('Persona');
    expect(el.querySelector('[data-ltable="Persona"]')).not.toBeNull();
  });

  it('doppio clic su una colonna la rinomina e le FK la seguono', () => {
    const { f, el, store, n } = render();
    el.querySelector('[data-ltable="Ordine"] [data-lcol="cliente_id"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    f.detectChanges();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Nome"]')!;
    input.value = 'idCliente';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.columns[1].name).toBe('idCliente');
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toHaveLength(1);
  });

  it('Canc elimina la tabella selezionata e Ctrl+Z la riporta', () => {
    const { f, el, store, n } = render();
    store.select([n.cliente]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    f.detectChanges();
    expect(el.querySelector('[data-ltable="Cliente"]')).toBeNull();
    expect(el.querySelectorAll('.lg-fk')).toHaveLength(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    f.detectChanges();
    expect(el.querySelector('[data-ltable="Cliente"]')).not.toBeNull();
  });

  it('senza tabelle mostra come cominciare', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.store.load({ ...buildNegozio().d, logical: undefined });
    f.componentInstance.store.setMode('logical');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nessuna tabella');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent!.includes("Genera dall'ER"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/logical-canvas/logical-canvas.spec.ts'`
Expected: FAIL (componente mancante).

- [ ] **Step 4: Implement the component**

Crea `web/src/app/editor/logical-canvas/logical-canvas.ts`:

```ts
import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { GRID } from '../../domain/geometry';
import { addTable, moveTables, renameTable, updateColumn } from '../../domain/logical-commands';
import { HEADER_H, ROW_H, Rect, fkEdges, logicalBounds, rowY, tableAt, tableRect } from '../../domain/logical-geometry';
import { Bounds } from '../../domain/geometry';
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
```

Crea `web/src/app/editor/logical-canvas/logical-canvas.html`:

```html
<svg
  #svg
  class="er-canvas h-full w-full"
  [class.cursor-crosshair]="store.tool() !== 'select'"
  role="application"
  aria-label="Schema logico"
  (pointerdown)="onBackgroundDown($event)"
  (pointermove)="onMove($event)"
  (pointerup)="onUp($event)"
  (pointercancel)="onUp($event)"
  (wheel)="onWheel($event)"
>
  <defs data-noexport>
    <pattern id="lg-grid" patternUnits="userSpaceOnUse" [attr.width]="gridSize()" [attr.height]="gridSize()" [attr.x]="view().x" [attr.y]="view().y">
      <circle class="er-grid-dot" cx="1" cy="1" r="1.1" />
    </pattern>
  </defs>
  <rect data-noexport width="100%" height="100%" fill="url(#lg-grid)" />

  <g data-export-root [attr.transform]="transform()">
    <!-- frecce delle chiavi esterne, sotto le tabelle -->
    @for (e of edges(); track e.id) {
      <g class="lg-fk" (pointerdown)="onEdgeDown($event, e.id)">
        @if (e.selected) {
          <polyline data-noexport class="er-selected" [attr.points]="e.line" />
        }
        <polyline class="er-hit-line" [attr.points]="e.line" />
        <polyline class="er-line" [attr.points]="e.line" />
        <polygon class="lg-arrow" [attr.points]="e.head" />
      </g>
    }

    @for (b of tables(); track b.t.id) {
      <g class="er-appear lg-table-g" [class.is-selected]="b.selected" [attr.data-ltable]="b.t.name" (pointerdown)="onTableDown($event, b.t.id)">
        @if (b.selected) {
          <rect data-noexport class="er-selected" [attr.x]="b.rect.x - 4" [attr.y]="b.rect.y - 4" [attr.width]="b.rect.w + 8" [attr.height]="b.rect.h + 8" rx="12" />
        }
        @if (b.error) {
          <rect data-noexport class="er-error-ring" [attr.x]="b.rect.x - 7" [attr.y]="b.rect.y - 7" [attr.width]="b.rect.w + 14" [attr.height]="b.rect.h + 14" rx="14" />
        }
        <rect class="er-entity-shape" [attr.x]="b.rect.x" [attr.y]="b.rect.y" [attr.width]="b.rect.w" [attr.height]="b.rect.h" rx="8" />
        <path class="lg-head" [attr.d]="headPath(b.rect)" />
        <line class="lg-sep" [attr.x1]="b.rect.x" [attr.y1]="b.rect.y + HEADER_H" [attr.x2]="b.rect.x + b.rect.w" [attr.y2]="b.rect.y + HEADER_H" />
        <text class="er-name" [attr.x]="b.rect.x + b.rect.w / 2" [attr.y]="b.rect.y + HEADER_H / 2" (dblclick)="onDblClickTable($event, b.t.id)">{{ b.t.name || '…' }}</text>
        @for (r of b.rows; track r.c.id; let i = $index) {
          <g [attr.data-lcol]="r.c.name" (dblclick)="onDblClickColumn($event, b.t.id, r.c.id)">
            <rect class="er-hit" [attr.x]="b.rect.x" [attr.y]="r.y - ROW_H / 2" [attr.width]="b.rect.w" [attr.height]="ROW_H" />
            @if (r.pk) {
              <g class="lg-icon" [attr.transform]="'translate(' + (b.rect.x + 10) + ' ' + (r.y - 6) + ')'">
                <circle cx="4" cy="6" r="2.6" /><path d="M6.6 6H12M10 6v3" />
              </g>
            } @else if (r.fk) {
              <g class="lg-icon" [attr.transform]="'translate(' + (b.rect.x + 10) + ' ' + (r.y - 6) + ')'">
                <path d="M1 6h9M7 3l3 3-3 3" />
              </g>
            }
            <text class="lg-col" [class.is-pk]="r.pk" [attr.x]="b.rect.x + 34" [attr.y]="r.y">{{ r.c.name }}@if (r.c.nullable) {<tspan class="lg-null">*</tspan>}</text>
            <text class="lg-type" [attr.x]="b.rect.x + b.rect.w - 14" [attr.y]="r.y">{{ r.c.type }}</text>
            <circle data-noexport class="lg-handle" [attr.cx]="b.rect.x + b.rect.w" [attr.cy]="r.y" r="5" (pointerdown)="onHandleDown($event, b.t.id, i)">
              <title>Trascina su un'altra tabella per creare una chiave esterna</title>
            </circle>
          </g>
        }
      </g>
    }

    @if (ghost(); as gl) {
      <line data-noexport class="er-ghost-line" [attr.x1]="gl.from.x" [attr.y1]="gl.from.y" [attr.x2]="gl.to.x" [attr.y2]="gl.to.y" />
    }
  </g>
</svg>

@if (!tables().length) {
  <div class="pointer-events-none absolute inset-0 grid place-items-center p-6">
    <div class="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-raised px-6 py-7 text-center shadow-float">
      <p class="font-display text-lg font-bold">Nessuna tabella</p>
      <p class="text-sm text-ink-2">Genera lo schema logico dal diagramma ER oppure parti da zero con lo strumento Tabella (<kbd class="ui-kbd">T</kbd>).</p>
      @if (!store.readonly()) {
        <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" (click)="store.requestGenerate()">Genera dall'ER</button>
      }
    </div>
  </div>
} @else if (!store.readonly()) {
  <div class="ui-float-bar py-1.5 pr-1.5">
    <span>Schema logico</span>
    <button type="button" class="ui-btn ui-btn-sm" [disabled]="store.layingOut()" (click)="store.requestGenerate()">Genera dall'ER</button>
  </div>
}

<div class="ui-btn-group ui-zoom">
  <button type="button" class="ui-btn ui-btn-sm ui-btn-icon text-base" (click)="zoomBy(1 / 1.2)" aria-label="Rimpicciolisci">−</button>
  <button type="button" class="ui-btn ui-btn-sm min-w-16 tabular-nums" (click)="fit()" title="Adatta alla vista (F)">{{ zoomPct() }}%</button>
  <button type="button" class="ui-btn ui-btn-sm ui-btn-icon text-base" (click)="zoomBy(1.2)" aria-label="Ingrandisci">+</button>
</div>

@if (editing(); as ed) {
  <input
    #renameInput
    class="ui-input ui-input-sm absolute z-(--z-overlay) w-52 -translate-x-1/2 -translate-y-1/2 shadow-pop"
    aria-label="Nome"
    maxlength="80"
    [style.left.px]="ed.x"
    [style.top.px]="ed.y"
    [value]="ed.value"
    (keydown.enter)="commitRename(renameInput.value)"
    (keydown.escape)="editing.set(null)"
    (blur)="commitRename(renameInput.value)"
  />
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/logical-canvas/logical-canvas.spec.ts'`
Expected: PASS. Note: `@if` dentro `<text>` e `<tspan>` è valido (blocchi di template, non elementi); se Angular si lamenta in SVG, sostituisci con `<tspan class="lg-null" [attr.display]="r.c.nullable ? null : 'none'">*</tspan>`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/editor/logical-canvas web/src/app/styles.css
git commit -m "feat(editor): canvas delle tabelle dello schema logico"
```

---

### Task 9: Form delle proprietà e pannelli per modo

**Files:**
- Create: `web/src/app/editor/logical-properties/logical-properties.ts`
- Create: `web/src/app/editor/logical-properties/logical-properties.html`
- Modify: `web/src/app/editor/side-panel/side-panel.ts`, `side-panel.html`
- Modify: `web/src/app/editor/problems/problems.ts`, `problems.html`
- Modify: `web/src/app/editor/logical-panel/logical-panel.ts`, `logical-panel.html`
- Modify: `web/src/app/editor/sql-panel/sql-panel.ts`, `sql-panel.html`
- Test: `web/src/app/editor/logical-properties/logical-properties.spec.ts`, e aggiunte a `panels.spec.ts`

**Interfaces:**
- Consumes: `EditorStore` (`mode`, `schema`, `activeIssues`, `activeErrorCount`), comandi del Task 2, `TypePicker`.
- Produces: componente `LogicalProperties` (`selector: 'app-logical-properties'`). Etichette accessibili usate anche dagli e2e (**non cambiarle**): `Nome della tabella`, `Nome della colonna`, `Chiave primaria: <colonna>`, `Può essere NULL: <colonna>`, `Univoca: <colonna>`, pulsanti `Aggiungi colonna`, `Elimina tabella`, `Nuova tabella`, select `Tabella riferita`, select `Colonna per <pk>`, pulsante `Aggiungi chiave esterna`.

- [ ] **Step 1: Write the failing tests**

Crea `web/src/app/editor/logical-properties/logical-properties.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { buildNegozio } from '../../domain/fixtures/logical';
import { tableById } from '../../domain/model';
import { EditorStore } from '../editor-store';
import { LogicalProperties } from './logical-properties';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  const n = buildNegozio();
  store.load(n.d);
  store.setMode('logical');
  const f = TestBed.createComponent(LogicalProperties);
  f.detectChanges();
  return { f, store, n, el: f.nativeElement as HTMLElement };
}
const q = <T extends Element>(el: Element, sel: string) => el.querySelector<T>(sel)!;
const change = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('LogicalProperties', () => {
  it('senza selezione elenca le tabelle e permette di crearne una', () => {
    const { f, store, n, el } = setup();
    expect(el.textContent).toContain('Cliente');
    expect(el.textContent).toContain('Ordine');
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Cliente'))!.click();
    expect([...store.selection()]).toEqual([n.cliente]);
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Nuova tabella'))!.click();
    f.detectChanges();
    expect(store.diagram().logical!.tables).toHaveLength(3);
  });

  it('rinomina la tabella e aggiunge una colonna', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    f.detectChanges();
    change(q(el, 'input[aria-label="Nome della tabella"]'), 'Persona');
    expect(tableById(store.diagram(), n.cliente)!.name).toBe('Persona');
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Aggiungi colonna'))!.click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.cliente)!.columns).toHaveLength(3);
  });

  it('cambia PK, NULL e UNIQUE di una colonna', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    f.detectChanges();
    q<HTMLInputElement>(el, 'input[aria-label="Chiave primaria: nome"]').click();
    q<HTMLInputElement>(el, 'input[aria-label="Univoca: nome"]').click();
    f.detectChanges();
    const t = tableById(store.diagram(), n.cliente)!;
    expect(t.primaryKey).toHaveLength(2);
    expect(t.uniques).toHaveLength(1);
    expect(q<HTMLInputElement>(el, 'input[aria-label="Può essere NULL: nome"]').checked).toBe(false);
  });

  it('crea una FK scegliendo la tabella e la colonna', () => {
    const { f, store, n, el } = setup();
    store.select([n.ordine]);
    f.detectChanges();
    change(q(el, 'select[aria-label="Tabella riferita"]'), n.cliente);
    f.detectChanges();
    change(q(el, 'select[aria-label="Colonna per id"]'), n.oId);
    f.detectChanges();
    q<HTMLButtonElement>(el, 'button[data-add-fk]').click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toHaveLength(2);
  });

  it('con una FK selezionata mostra la sua tabella e permette di eliminarla', () => {
    const { f, store, n, el } = setup();
    store.select([n.fk]);
    f.detectChanges();
    expect(q<HTMLInputElement>(el, 'input[aria-label="Nome della tabella"]').value).toBe('Ordine');
    q<HTMLButtonElement>(el, 'button[data-del-fk]').click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toEqual([]);
  });

  it('elimina una colonna e la tabella', () => {
    const { f, store, n, el } = setup();
    store.select([n.ordine]);
    f.detectChanges();
    q<HTMLButtonElement>(el, 'button[aria-label="Elimina la colonna cliente_id"]').click();
    f.detectChanges();
    expect(tableById(store.diagram(), n.ordine)!.columns).toHaveLength(1);
    expect(tableById(store.diagram(), n.ordine)!.foreignKeys).toEqual([]);
    q<HTMLButtonElement>(el, 'button[data-del-table]').click();
    f.detectChanges();
    expect(store.diagram().logical!.tables).toHaveLength(1);
  });

  it('riordina le colonne', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    f.detectChanges();
    q<HTMLButtonElement>(el, 'button[aria-label="Sposta giù la colonna id"]').click();
    expect(tableById(store.diagram(), n.cliente)!.columns.map((c) => c.name)).toEqual(['nome', 'id']);
  });

  it('in sola lettura i campi sono bloccati', () => {
    const { f, store, n, el } = setup();
    store.select([n.cliente]);
    store.readonly.set(true);
    f.detectChanges();
    expect(q<HTMLInputElement>(el, 'input[aria-label="Nome della tabella"]').readOnly).toBe(true);
  });
});
```

Aggiungi a `panels.spec.ts` (nuovo `describe` in fondo; riusa gli helper/`setup` di quel file se ne ha, altrimenti usa questo blocco autonomo):

```ts
import { buildNegozio } from '../domain/fixtures/logical';
import { Problems } from './problems/problems';
import { LogicalPanel } from './logical-panel/logical-panel';
import { SqlPanel } from './sql-panel/sql-panel';
import { renameTable } from '../domain/logical-commands';

describe('pannelli in modo Logico', () => {
  function setup(cmp: typeof Problems | typeof LogicalPanel | typeof SqlPanel) {
    TestBed.configureTestingModule({ providers: [EditorStore] });
    const store = TestBed.inject(EditorStore);
    const n = buildNegozio();
    store.load(n.d);
    store.setMode('logical');
    const f = TestBed.createComponent(cmp);
    f.detectChanges();
    return { f, store, n, el: f.nativeElement as HTMLElement };
  }

  it('lo schema logico mostra le tabelle fatte a mano', () => {
    const { el } = setup(LogicalPanel);
    expect(el.querySelector('[data-table="Ordine"]')!.textContent).toContain('cliente_id→CLIENTE');
  });

  it("l'SQL contiene la FK dello schema a mano", () => {
    const { el } = setup(SqlPanel);
    expect(el.querySelector('pre')!.textContent).toContain('REFERENCES "Cliente" ("id")');
  });

  it('con errori il pannello Schema mostra il callout e non il testo', () => {
    const { f, store, n, el } = setup(LogicalPanel);
    store.apply((d) => renameTable(d, n.ordine, ''));
    f.detectChanges();
    expect(el.querySelector('.ui-callout')!.textContent).toContain('1 errori');
    expect(el.querySelector('[data-table]')).toBeNull();
  });

  it('il pannello Problemi elenca quelli del modo Logico', () => {
    const { f, store, n, el } = setup(Problems);
    store.apply((d) => renameTable(d, n.ordine, ''));
    f.detectChanges();
    expect(el.textContent).toContain('Una tabella non ha un nome');
    expect(el.textContent).not.toContain('identificatore');
  });

  it('senza tabelle lo schema dice come cominciare', () => {
    TestBed.configureTestingModule({ providers: [EditorStore] });
    const store = TestBed.inject(EditorStore);
    store.load({ ...buildNegozio().d, logical: undefined });
    store.setMode('logical');
    const f = TestBed.createComponent(LogicalPanel);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Nessuna tabella');
  });
});
```

(Verifica che `TestBed`, `EditorStore` siano già importati in `panels.spec.ts`; altrimenti importali.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/logical-properties/logical-properties.spec.ts' --include='src/app/editor/panels.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Implement `LogicalProperties`**

`logical-properties.ts`:

```ts
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  addColumn, addForeignKey, addTable, checkForeignKey, deleteColumn, deleteForeignKey, deleteTables, moveColumn, removeUnique,
  renameTable, setForeignKeyColumns, toggleUnique, togglePrimaryKey, updateColumn,
} from '../../domain/logical-commands';
import { Id, LForeignKey, LTable, findForeignKey, tableById } from '../../domain/model';
import { EditorStore } from '../editor-store';
import { TypePicker } from '../type-picker/type-picker';

@Component({ selector: 'app-logical-properties', templateUrl: './logical-properties.html', imports: [TypePicker] })
export class LogicalProperties {
  protected readonly store = inject(EditorStore);
  protected readonly ro = computed(() => this.store.readonly());
  protected readonly tables = computed(() => this.store.diagram().logical?.tables ?? []);
  /** La tabella selezionata, o quella della FK selezionata. */
  protected readonly table = computed<LTable | undefined>(() => {
    const d = this.store.diagram();
    for (const id of this.store.selection()) {
      const t = tableById(d, id) ?? findForeignKey(d, id)?.table;
      if (t) return t;
    }
    return undefined;
  });
  protected readonly selectedFk = computed<Id | undefined>(() => {
    const d = this.store.diagram();
    return [...this.store.selection()].find((id) => findForeignKey(d, id));
  });

  // bozza della nuova chiave esterna
  protected readonly draftRef = signal<Id | ''>('');
  protected readonly draftCols = signal<Array<Id | ''>>([]);
  protected readonly refPk = computed(() => {
    const r = tableById(this.store.diagram(), this.draftRef());
    return r ? r.primaryKey.map((id) => r.columns.find((c) => c.id === id)!).filter(Boolean) : [];
  });
  protected readonly draftError = computed(() => {
    const t = this.table();
    const ref = this.draftRef();
    if (!t || !ref) return null;
    return checkForeignKey(this.store.diagram(), t.id, this.draftCols().filter((c): c is Id => !!c), ref);
  });

  constructor() {
    effect(() => {
      this.table()?.id;
      untracked(() => {
        this.draftRef.set('');
        this.draftCols.set([]);
      });
    });
  }

  newTable(): void {
    const id = this.store.create((d) => addTable(d, { x: 32, y: 32 }));
    this.store.focus([id]);
  }

  pick(id: Id): void {
    this.store.select([id]);
  }

  renameTable(t: LTable, name: string): void {
    this.store.apply((d) => renameTable(d, t.id, name));
  }

  removeTable(t: LTable): void {
    this.store.apply((d) => deleteTables(d, [t.id]));
    this.store.selection.set(new Set());
  }

  addCol(t: LTable): void {
    this.store.apply((d) => addColumn(d, t.id).diagram);
  }

  rename(t: LTable, colId: Id, name: string): void {
    this.store.apply((d) => updateColumn(d, t.id, colId, { name }));
  }

  setType(t: LTable, colId: Id, type: string): void {
    this.store.apply((d) => updateColumn(d, t.id, colId, { type }));
  }

  setNullable(t: LTable, colId: Id, nullable: boolean): void {
    this.store.apply((d) => updateColumn(d, t.id, colId, { nullable }));
  }

  togglePk(t: LTable, colId: Id): void {
    this.store.apply((d) => togglePrimaryKey(d, t.id, colId));
  }

  toggleUq(t: LTable, colId: Id): void {
    this.store.apply((d) => toggleUnique(d, t.id, colId));
  }

  isUnique(t: LTable, colId: Id): boolean {
    return t.uniques.some((u) => u.length === 1 && u[0] === colId);
  }

  compositeUniques(t: LTable): Array<{ index: number; label: string }> {
    return t.uniques
      .map((u, index) => ({ index, u }))
      .filter((x) => x.u.length > 1)
      .map((x) => ({ index: x.index, label: x.u.map((id) => t.columns.find((c) => c.id === id)?.name ?? '?').join(', ') }));
  }

  removeUq(t: LTable, index: number): void {
    this.store.apply((d) => removeUnique(d, t.id, index));
  }

  move(t: LTable, colId: Id, delta: -1 | 1): void {
    this.store.apply((d) => moveColumn(d, t.id, colId, delta));
  }

  removeCol(t: LTable, colId: Id): void {
    this.store.apply((d) => deleteColumn(d, t.id, colId));
  }

  // --- chiavi esterne ---
  fkLabel(t: LTable, f: LForeignKey): string {
    const r = this.tables().find((x) => x.id === f.refTableId);
    const cols = f.columnIds.map((id) => t.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
    const refs = f.refColumnIds.map((id) => r?.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
    return `(${cols}) → ${r?.name ?? '?'}(${refs})`;
  }

  selectFk(id: Id): void {
    this.store.select([id]);
  }

  removeFk(t: LTable, id: Id): void {
    this.store.apply((d) => deleteForeignKey(d, t.id, id));
  }

  setFkColumn(t: LTable, f: LForeignKey, position: number, colId: Id): void {
    const next = f.columnIds.map((c, i) => (i === position ? colId : c));
    this.store.apply((d) => setForeignKeyColumns(d, t.id, f.id, next));
  }

  pickRef(id: string): void {
    this.draftRef.set(id);
    this.draftCols.set(this.refPk().map(() => ''));
  }

  pickDraftCol(position: number, colId: string): void {
    this.draftCols.update((cols) => cols.map((c, i) => (i === position ? colId : c)));
  }

  canAddFk(): boolean {
    return !!this.draftRef() && this.draftCols().every((c) => !!c) && this.draftCols().length > 0 && !this.draftError();
  }

  addFk(t: LTable): void {
    const cols = this.draftCols().filter((c): c is Id => !!c);
    const ref = this.draftRef();
    if (!ref || this.draftError()) return;
    this.store.create((d) => addForeignKey(d, t.id, cols, ref));
    this.draftRef.set('');
    this.draftCols.set([]);
  }
}
```

`logical-properties.html` (struttura, usa le classi `ui-*` già nel progetto):

```html
<section class="ui-panel-body" aria-label="Proprietà della tabella">
  @if (table(); as t) {
    <header>
      <p class="ui-kind">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M1.5 6h13" /></svg>
        Tabella
      </p>
      <input class="ui-input h-10 font-display text-base font-bold" aria-label="Nome della tabella" maxlength="80"
        [value]="t.name" [readonly]="ro()" (change)="renameTable(t, $any($event.target).value)" />
    </header>

    <div class="ui-section">
      <div class="ui-section-head">
        <h3 class="ui-section-title">Colonne</h3>
        <button type="button" class="ui-btn ui-btn-ghost ui-btn-xs text-accent-text" [disabled]="ro()" (click)="addCol(t)">+ Aggiungi colonna</button>
      </div>
      <p class="ui-hint -mt-1">Chiave primaria · Può essere NULL · Univoca.</p>
      @if (!t.columns.length) {
        <p class="rounded-xl border border-dashed border-line-strong/60 px-3 py-4 text-center text-[0.8125rem] text-ink-2">Nessuna colonna: usa «+ Aggiungi colonna».</p>
      } @else {
        <ul class="ui-list">
          @for (c of t.columns; track c.id; let first = $first; let last = $last) {
            <li class="ui-row">
              <div class="flex items-center gap-2">
                <input class="ui-input ui-input-sm" aria-label="Nome della colonna" maxlength="80"
                  [value]="c.name" [readonly]="ro()" (change)="rename(t, c.id, $any($event.target).value)" />
                <button type="button" class="ui-btn ui-btn-ghost ui-btn-xs ui-btn-icon" [attr.aria-label]="'Sposta su la colonna ' + c.name" [disabled]="ro() || first" (click)="move(t, c.id, -1)">
                  <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                </button>
                <button type="button" class="ui-btn ui-btn-ghost ui-btn-xs ui-btn-icon" [attr.aria-label]="'Sposta giù la colonna ' + c.name" [disabled]="ro() || last" (click)="move(t, c.id, 1)">
                  <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <button type="button" class="ui-btn ui-btn-ghost ui-btn-xs ui-btn-icon hover:text-danger-text!" [attr.aria-label]="'Elimina la colonna ' + c.name" [disabled]="ro()" (click)="removeCol(t, c.id)">
                  <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <app-type-picker [value]="c.type" [disabled]="ro()" (changed)="setType(t, c.id, $event)" />
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
                <label class="ui-choice"><input type="checkbox" class="ui-checkbox" [attr.aria-label]="'Chiave primaria: ' + c.name" [checked]="t.primaryKey.includes(c.id)" [disabled]="ro()" (change)="togglePk(t, c.id)" /><span>PK</span></label>
                <label class="ui-choice"><input type="checkbox" class="ui-checkbox" [attr.aria-label]="'Può essere NULL: ' + c.name" [checked]="c.nullable" [disabled]="ro()" (change)="setNullable(t, c.id, $any($event.target).checked)" /><span>NULL</span></label>
                <label class="ui-choice"><input type="checkbox" class="ui-checkbox" [attr.aria-label]="'Univoca: ' + c.name" [checked]="isUnique(t, c.id)" [disabled]="ro()" (change)="toggleUq(t, c.id)" /><span>UNIQUE</span></label>
              </div>
            </li>
          }
        </ul>
      }
      @for (u of compositeUniques(t); track u.index) {
        <p class="flex items-center gap-2 text-[0.8125rem]">
          <span class="min-w-0 flex-1">UNIQUE ({{ u.label }})</span>
          <button type="button" class="ui-btn ui-btn-ghost ui-btn-xs" [disabled]="ro()" (click)="removeUq(t, u.index)">Togli</button>
        </p>
      }
    </div>

    <div class="ui-section">
      <h3 class="ui-section-title">Chiavi esterne</h3>
      @for (f of t.foreignKeys; track f.id) {
        <div class="ui-row" [class.is-active]="selectedFk() === f.id">
          <div class="flex items-center gap-2">
            <button type="button" class="min-w-0 flex-1 text-left font-mono text-[0.8125rem]" (click)="selectFk(f.id)">{{ fkLabel(t, f) }}</button>
            <button type="button" data-del-fk class="ui-btn ui-btn-ghost ui-btn-xs hover:text-danger-text!" [disabled]="ro()" [attr.aria-label]="'Elimina la chiave esterna ' + fkLabel(t, f)" (click)="removeFk(t, f.id)">Elimina</button>
          </div>
          @for (rc of f.columnIds; track $index; let i = $index) {
            <select class="ui-select ui-select-sm" [attr.aria-label]="'Colonna ' + (i + 1) + ' della chiave esterna'" [disabled]="ro()" (change)="setFkColumn(t, f, i, $any($event.target).value)">
              @for (c of t.columns; track c.id) {
                <option [value]="c.id" [selected]="c.id === rc">{{ c.name }}</option>
              }
            </select>
          }
        </div>
      }
      @if (tables().length) {
        <select class="ui-select ui-select-sm" aria-label="Tabella riferita" [disabled]="ro()" (change)="pickRef($any($event.target).value)">
          <option value="" [selected]="!draftRef()">Nuova chiave esterna verso…</option>
          @for (r of tables(); track r.id) {
            <option [value]="r.id" [selected]="draftRef() === r.id">{{ r.name }}</option>
          }
        </select>
      }
      @if (draftRef()) {
        @for (pk of refPk(); track pk.id; let i = $index) {
          <select class="ui-select ui-select-sm" [attr.aria-label]="'Colonna per ' + pk.name" (change)="pickDraftCol(i, $any($event.target).value)">
            <option value="" [selected]="!draftCols()[i]">Colonna per {{ pk.name }}…</option>
            @for (c of t.columns; track c.id) {
              <option [value]="c.id" [selected]="draftCols()[i] === c.id">{{ c.name }}</option>
            }
          </select>
        }
        @if (draftError(); as err) {
          <p class="ui-hint text-danger-text">{{ err }}</p>
        }
        <button type="button" data-add-fk class="ui-btn ui-btn-sm" [disabled]="ro() || !canAddFk()" (click)="addFk(t)">Aggiungi chiave esterna</button>
      }
    </div>

    <button type="button" data-del-table class="ui-btn ui-btn-sm hover:text-danger-text!" [disabled]="ro()" (click)="removeTable(t)">Elimina tabella</button>
  } @else {
    <header>
      <p class="ui-kind">Schema logico</p>
      <p class="text-[0.8125rem] text-ink-2">Seleziona una tabella sul foglio, oppure sceglila qui.</p>
    </header>
    @if (tables().length) {
      <ul class="ui-list">
        @for (x of tables(); track x.id) {
          <li class="ui-row"><button type="button" class="w-full text-left font-bold" (click)="pick(x.id)">{{ x.name || 'senza nome' }}</button></li>
        }
      </ul>
    }
    <button type="button" class="ui-btn ui-btn-sm" [disabled]="ro()" (click)="newTable()">+ Nuova tabella</button>
  }
</section>
```

Il test cerca `button` con testo `Nuova tabella` (il `+ Nuova tabella` lo contiene) e `Aggiungi colonna`.

- [ ] **Step 4: Wire the panels**

`side-panel.ts`: importa `LogicalProperties`, aggiungilo a `imports`, e cambia `warnings` in `computed(() => this.store.activeIssues().filter((i) => i.severity === 'warning').length)`.

`side-panel.html`: sostituisci `@case ('props') { <app-properties /> }` con
```html
      @case ('props') {
        @if (store.mode() === 'logical') { <app-logical-properties /> } @else { <app-properties /> }
      }
```
e nel badge dei problemi sostituisci `store.errorCount()` con `store.activeErrorCount()` (due occorrenze: `@if` e interpolazione).

`problems.ts`: `warnings` → `this.store.activeIssues()`. `problems.html`: sostituisci `store.issues()` (due volte) con `store.activeIssues()` e `store.errorCount()` con `store.activeErrorCount()`; nel ramo "Nessun problema" cambia la frase in `{{ store.mode() === 'logical' ? 'Lo schema logico è pronto per l\'esportazione.' : 'Il diagramma è pronto per lo schema logico.' }}`.

`logical-panel.ts`: `this.store.logical()` → `this.store.schema()`. `logical-panel.html`: `store.logical()` → `store.schema()`, `store.errorCount()` → `store.activeErrorCount()`; dentro `@if (store.schema(); as l)` prima della `<ul>` aggiungi
```html
    @if (!l.tables.length) {
      <p class="ui-hint">Nessuna tabella{{ store.mode() === 'logical' ? ': generale dall\'ER o aggiungine una a mano.' : '.' }}</p>
    }
```
(scrivi «generala» se preferisci; il test cerca solo `Nessuna tabella`).

`sql-panel.ts`: `this.store.logical()` → `this.store.schema()`. `sql-panel.html`: `store.errorCount()` → `store.activeErrorCount()`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false`
Expected: tutti verdi (inclusi `panels.spec.ts` originali: in modo ER nulla cambia).

- [ ] **Step 6: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/editor/logical-properties web/src/app/editor/side-panel web/src/app/editor/problems web/src/app/editor/logical-panel web/src/app/editor/sql-panel web/src/app/editor/panels.spec.ts
git commit -m "feat(editor): form delle tabelle logiche e pannelli per modo"
```

---

### Task 10: Interruttore ER | Logico, palette, conferma di rigenerazione, esportazioni

**Files:**
- Create: `web/src/app/editor/regenerate-dialog/regenerate-dialog.{ts,html}`
- Modify: `web/src/app/editor/palette/palette.ts`, `palette.html`
- Modify: `web/src/app/editor/top-bar/top-bar.ts`, `top-bar.html`
- Modify: `web/src/app/pages/editor-page/editor-page.ts`, `editor-page.html`
- Test: `web/src/app/editor/regenerate-dialog/regenerate-dialog.spec.ts`, `web/src/app/editor/palette/palette.spec.ts`

**Interfaces:**
- Consumes: `EditorStore.mode/setMode/confirmRegenerate/generateLogical/layoutLogical/schema`, `LogicalCanvas`, `logicalBounds`.
- Produces: componente `RegenerateDialog` (`app-regenerate-dialog`); interruttore con pulsanti accessibili `ER` e `Logico` (`aria-pressed`); in modo Logico la palette mostra solo `Seleziona` (V) e `Tabella` (T) più il layout (L).

- [ ] **Step 1: Write the failing tests**

`regenerate-dialog.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { buildCarrozzeria } from '../../domain/fixtures/carrozzeria';
import { buildNegozio } from '../../domain/fixtures/logical';
import { EditorStore } from '../editor-store';
import { RegenerateDialog } from './regenerate-dialog';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  store.load({ ...buildCarrozzeria(), logical: buildNegozio().d.logical });
  const f = TestBed.createComponent(RegenerateDialog);
  f.detectChanges();
  return { f, store, el: f.nativeElement as HTMLElement };
}

describe('RegenerateDialog', () => {
  it('si apre quando serve la conferma e Annulla la chiude senza toccare lo schema', () => {
    const { f, store, el } = setup();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBe(false);
    store.requestGenerate();
    f.detectChanges();
    expect(dialog.open).toBe(true);
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Annulla'))!.click();
    f.detectChanges();
    expect(store.confirmRegenerate()).toBe(false);
    expect(dialog.open).toBe(false);
    expect(store.diagram().logical!.tables.map((t) => t.name)).toEqual(['Cliente', 'Ordine']);
  });

  it('Sostituisci rigenera dall\'ER', async () => {
    const { f, store, el } = setup();
    store.requestGenerate();
    f.detectChanges();
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Sostituisci'))!.click();
    await vi.waitFor(() => expect(store.diagram().logical!.tables).toHaveLength(5));
    expect(store.confirmRegenerate()).toBe(false);
  });
});
```

`palette.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { buildNegozio } from '../../domain/fixtures/logical';
import { EditorStore } from '../editor-store';
import { Palette } from './palette';

function setup() {
  TestBed.configureTestingModule({ providers: [EditorStore] });
  const store = TestBed.inject(EditorStore);
  store.load(buildNegozio().d);
  const f = TestBed.createComponent(Palette);
  f.detectChanges();
  return { f, store, el: f.nativeElement as HTMLElement };
}
const labels = (el: HTMLElement) => [...el.querySelectorAll('button.ui-tool')].map((b) => b.getAttribute('aria-label'));

describe('Palette', () => {
  it('in modo ER ha gli strumenti ER; in Logico Seleziona, Tabella e layout', () => {
    const { f, store, el } = setup();
    expect(labels(el)).toContain('Entità');
    store.setMode('logical');
    f.detectChanges();
    expect(labels(el)).toEqual(['Seleziona', 'Tabella', 'Sistema il layout']);
  });

  it('lo strumento Tabella attiva il tool "table"', () => {
    const { f, store, el } = setup();
    store.setMode('logical');
    f.detectChanges();
    (el.querySelector('button[aria-label="Tabella"]') as HTMLButtonElement).click();
    expect(store.tool()).toBe('table');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false --include='src/app/editor/regenerate-dialog/*.spec.ts' --include='src/app/editor/palette/*.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Implement the dialog**

`regenerate-dialog.ts`:

```ts
import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { EditorStore } from '../editor-store';

@Component({ selector: 'app-regenerate-dialog', templateUrl: './regenerate-dialog.html' })
export class RegenerateDialog {
  protected readonly store = inject(EditorStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.store.confirmRegenerate() && !el.open) el.showModal();
      if (!this.store.confirmRegenerate() && el.open) el.close();
    });
  }

  cancel(): void {
    this.store.confirmRegenerate.set(false);
  }

  replace(): void {
    this.store.confirmRegenerate.set(false);
    void this.store.generateLogical();
  }
}
```

`regenerate-dialog.html`:

```html
<dialog #dialog class="ui-modal" aria-labelledby="regen-title" (cancel)="$event.preventDefault(); cancel()">
  <div class="ui-modal-box max-w-lg">
    <h2 id="regen-title" class="ui-modal-title">Sostituire lo schema logico?</h2>
    <p class="ui-modal-body">
      Lo schema logico di questo diagramma verrà rigenerato dall'ER e le modifiche fatte a mano andranno perse.
      Puoi sempre annullare con Ctrl+Z.
    </p>
    <div class="ui-modal-actions">
      <button type="button" class="ui-btn" (click)="cancel()">Annulla</button>
      <button type="button" class="ui-btn ui-btn-primary" (click)="replace()">Sostituisci</button>
    </div>
  </div>
</dialog>
```

- [ ] **Step 4: Palette**

`palette.ts`: sostituisci `items` con due elenchi e un `computed`:

```ts
import { Component, computed, inject } from '@angular/core';
/* ... */
const ER_ITEMS: Item[] = [ /* i cinque elementi esistenti, invariati */ ];
const LOGICAL_ITEMS: Item[] = [
  { tool: 'select', label: 'Seleziona', key: 'V', hint: 'Seleziona e sposta le tabelle; trascina il pallino di una colonna su un\'altra tabella per creare una chiave esterna.' },
  { tool: 'table', label: 'Tabella', key: 'T', hint: 'Clicca sul foglio per creare una tabella.' },
];
/* nella classe: */
  protected readonly items = computed(() => (this.store.mode() === 'logical' ? LOGICAL_ITEMS : ER_ITEMS));
  layout(): void {
    if (this.store.mode() === 'logical') void this.store.layoutLogical();
    else void this.store.autoLayout();
  }
```
(`Tool` ha già `'table'` dal Task 7; `choose()` resta com'è: il ramo `else` gestisce `select` e `table`.)

`palette.html`: `@for (it of items; ...)` → `@for (it of items(); ...)`; aggiungi nello `@switch (it.tool)`:

```html
          @case ('table') {
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14.5h18M9 9v11" /></svg>
          }
```
e nel pulsante layout sostituisci `(click)="store.autoLayout()"` con `(click)="layout()"`.

- [ ] **Step 5: Top bar**

`top-bar.ts`: aggiungi `import { logicalBounds } from '../../domain/logical-geometry';`, e cambia:

```ts
  async exportImage(kind: 'png' | 'svg'): Promise<void> {
    const svgEl = this.store.canvasSvg?.();
    const d = this.store.diagram();
    const bounds = this.store.mode() === 'logical' ? (d.logical ? logicalBounds(d.logical) : null) : sceneExportBounds(d);
    /* ...resto invariato... */
```
```ts
  exportText(kind: 'logical' | 'postgres' | 'mysql'): void {
    const l = this.store.schema();
    /* ...resto invariato... */
```

`top-bar.html`: prima del `<div class="ui-btn-group is-quiet">` degli annulla/ripeti aggiungi:

```html
  <div class="ui-segmented" role="group" aria-label="Tipo di diagramma">
    <button type="button" class="ui-segment" [class.is-active]="store.mode() === 'er'" [attr.aria-pressed]="store.mode() === 'er'" (click)="store.setMode('er')">ER</button>
    <button type="button" class="ui-segment" [class.is-active]="store.mode() === 'logical'" [attr.aria-pressed]="store.mode() === 'logical'" (click)="store.setMode('logical')">Logico</button>
  </div>
```
e sostituisci `store.logical()` con `store.schema()` nelle tre voci del menu «Schema» (`[disabled]="!store.schema()"`).

- [ ] **Step 6: Editor page**

`editor-page.ts`: importa `LogicalCanvas` e `RegenerateDialog` e aggiungili a `imports`.

`editor-page.html`: sostituisci

```html
      @if (ready()) {
        <app-canvas />
      }
```
con
```html
      @if (ready()) {
        @if (store.mode() === 'logical') {
          <app-logical-canvas />
        } @else {
          <app-canvas />
        }
      }
```
e dopo `<app-conflict-dialog />` aggiungi `<app-regenerate-dialog />`.

- [ ] **Step 7: Run tests + build**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false && npx ng build 2>&1 | tail -5`
Expected: test verdi; build senza errori.

- [ ] **Step 8: Commit**

```bash
cd ~/Documenti/Rombo
git add web/src/app/editor/regenerate-dialog web/src/app/editor/palette web/src/app/editor/top-bar web/src/app/pages/editor-page
git commit -m "feat(editor): interruttore ER/Logico, strumenti, conferma di rigenerazione ed esportazioni"
```

---

### Task 11: Prove end-to-end, accessibilità, README

**Files:**
- Create: `web/e2e/fixtures/er-semplice.json`
- Create: `web/e2e/logical.spec.ts`
- Modify: `README.md` (radice del repo)

**Interfaces:**
- Consumes: l'app intera; le etichette del Task 9 e gli attributi `data-ltable`/`data-lcol`/`.lg-fk` del Task 8.

- [ ] **Step 1: Fixture ER minimo**

Crea `web/e2e/fixtures/er-semplice.json` (Proprietario(CF) 1,N — Auto(Targa) 1,1; ER senza errori):

```json
{
  "version": 1,
  "id": "fixture-er-semplice",
  "title": "Auto e proprietari",
  "entities": [
    {
      "id": "e1", "name": "Proprietario", "pos": { "x": 200, "y": 200 },
      "attributes": [{ "id": "a1", "name": "CF", "card": "1,1", "type": "CHAR(16)", "angle": -1.57 }],
      "primary": { "attributeIds": ["a1"], "externalVia": [] }, "alternates": []
    },
    {
      "id": "e2", "name": "Auto", "pos": { "x": 600, "y": 200 },
      "attributes": [{ "id": "a2", "name": "Targa", "card": "1,1", "type": "CHAR(7)", "angle": -1.57 }],
      "primary": { "attributeIds": ["a2"], "externalVia": [] }, "alternates": []
    }
  ],
  "relationships": [
    {
      "id": "r1", "name": "possiede", "pos": { "x": 400, "y": 200 },
      "participants": [
        { "entityId": "e1", "min": 1, "max": "N" },
        { "entityId": "e2", "min": 1, "max": 1 }
      ],
      "attributes": []
    }
  ],
  "generalizations": []
}
```

- [ ] **Step 2: Write the e2e tests**

Crea `web/e2e/logical.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import path from 'node:path';

const fixture = path.join(__dirname, 'fixtures', 'er-semplice.json');

test("genera lo schema dall'ER, lo modifica a mano e lo ritrova dopo l'esportazione", async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page).toHaveURL(/\/d\//);
  await expect(page.getByRole('application', { name: 'Diagramma entità-relazione' })).toBeVisible();

  await page.getByRole('button', { name: 'Logico' }).click();
  const canvas = page.getByRole('application', { name: 'Schema logico' });
  await expect(canvas).toBeVisible();
  await expect(page.getByText('Nessuna tabella').first()).toBeVisible();
  await page.getByRole('button', { name: "Genera dall'ER" }).first().click();

  await expect(page.locator('[data-ltable="Auto"]')).toBeVisible();
  await expect(page.locator('[data-ltable="Proprietario"]')).toBeVisible();
  await expect(page.locator('.lg-fk')).toHaveCount(1);

  // rinomina una colonna dal form: la FK la segue
  await page.locator('[data-ltable="Auto"] .er-name').click();
  await page.getByLabel('Nome della colonna').nth(1).fill('codice_fiscale');
  await page.getByLabel('Nome della colonna').nth(1).press('Tab');
  await expect(page.locator('[data-ltable="Auto"] [data-lcol="codice_fiscale"]')).toBeVisible();
  await expect(page.locator('.lg-fk')).toHaveCount(1);

  // notazione e SQL seguono lo schema a mano
  await page.getByRole('tab', { name: 'Schema logico' }).click();
  await expect(page.locator('[data-table="Auto"]')).toContainText('codice_fiscale→PROPRIETARIO');
  await page.getByRole('tab', { name: 'SQL' }).click();
  await expect(page.locator('pre code')).toContainText('FOREIGN KEY ("codice_fiscale") REFERENCES "Proprietario" ("CF")');

  // rigenerare chiede conferma e annullare non tocca niente
  await page.getByRole('button', { name: "Genera dall'ER" }).first().click();
  await expect(page.getByRole('heading', { name: 'Sostituire lo schema logico?' })).toBeVisible();
  await page.getByRole('button', { name: 'Annulla' }).click();
  await expect(page.locator('[data-ltable="Auto"] [data-lcol="codice_fiscale"]')).toBeVisible();

  // esporta il file, riaprilo: lo schema a mano c'e'
  await page.getByRole('button', { name: 'Esporta' }).click();
  const json = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File diagramma (.er.json)' }).click();
  const file = await (await json).path();
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(file!);
  await expect(page).toHaveURL(/\/d\//);
  await page.getByRole('button', { name: 'Logico' }).click();
  await expect(page.locator('[data-ltable="Auto"] [data-lcol="codice_fiscale"]')).toBeVisible();
});

test('parte da zero: due tabelle, colonne e una chiave esterna dal form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuovo diagramma' }).first().click();
  await expect(page.getByRole('application', { name: 'Diagramma entità-relazione' })).toBeVisible();
  await page.getByRole('button', { name: 'Logico' }).click();
  const canvas = page.getByRole('application', { name: 'Schema logico' });
  await expect(canvas).toBeVisible();

  const nameIn = page.getByLabel('Nome', { exact: true });
  for (const [n, x] of [['Cliente', 200], ['Ordine', 700]] as const) {
    await page.keyboard.press('t');
    await canvas.click({ position: { x, y: 250 } });
    await nameIn.fill(n);
    await page.keyboard.press('Enter');
    await expect(nameIn).toBeHidden();
    await page.getByRole('button', { name: /Aggiungi colonna/ }).click();
    await page.getByLabel('Nome della colonna').first().fill('id');
    await page.getByLabel('Nome della colonna').first().press('Tab');
    await page.getByLabel('Chiave primaria: id').check();
  }
  await page.getByRole('button', { name: /Aggiungi colonna/ }).click();
  await page.getByLabel('Nome della colonna').nth(1).fill('cliente_id');
  await page.getByLabel('Nome della colonna').nth(1).press('Tab');

  // Ordine e selezionato: FK verso Cliente
  await page.getByLabel('Tabella riferita').selectOption({ label: 'Cliente' });
  await page.getByLabel('Colonna per id').selectOption({ label: 'cliente_id' });
  await page.getByRole('button', { name: 'Aggiungi chiave esterna' }).click();
  await expect(page.locator('.lg-fk')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Schema logico' }).click();
  await expect(page.locator('[data-table="ORDINE"]')).toContainText('cliente_id→CLIENTE');

  // annulla l'ultima FK con Ctrl+Z dal foglio
  await canvas.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.lg-fk')).toHaveCount(0);
});

test('crea una FK trascinando dalla maniglia di una colonna su un\'altra tabella', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page).toHaveURL(/\/d\//);
  await page.getByRole('button', { name: 'Logico' }).click();
  await page.getByRole('button', { name: "Genera dall'ER" }).first().click();
  await expect(page.locator('.lg-fk')).toHaveCount(1);
  // togli la FK generata dal form, poi ricreala col mouse
  await page.locator('[data-ltable="Auto"] .er-name').click();
  await page.locator('button[data-del-fk]').click();
  await expect(page.locator('.lg-fk')).toHaveCount(0);

  const handle = page.locator('[data-ltable="Auto"] [data-lcol="Targa"] .lg-handle');
  const target = page.locator('[data-ltable="Proprietario"] .er-name');
  await page.locator('[data-ltable="Auto"] .er-name').hover();
  const h = (await handle.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.lg-fk')).toHaveCount(1);
});

for (const theme of ['quaderno', 'lavagna']) {
  test(`modo Logico: contrasto e accessibilità nel tema ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('diagrammier.theme', t), theme);
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(fixture);
    await expect(page).toHaveURL(/\/d\//);
    await page.getByRole('button', { name: 'Logico' }).click();
    await page.getByRole('button', { name: "Genera dall'ER" }).first().click();
    await expect(page.locator('[data-ltable="Auto"]')).toBeVisible();
    await page.locator('[data-ltable="Auto"] .er-name').click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
}
```

- [ ] **Step 3: Run the e2e**

Run: `cd ~/Documenti/Rombo/web && npx playwright test e2e/logical.spec.ts 2>&1 | tail -30`
(Il `webServer` di Playwright avvia `ng serve` da solo; se Chromium non è installato: `npx playwright install chromium`.)
Expected: tutti PASS. In caso di violazioni axe, correggi l'interfaccia (contrasto, nomi accessibili: es. il `<circle class="lg-handle">` ha un `<title>`; i `select` hanno `aria-label`), **non** disattivare regole.
Se il drag della maniglia fallisce solo perché la maniglia è `opacity: 0` fuori da hover: l'`hover()` sul nome della tabella la mostra; non cambiare `pointer-events`.

- [ ] **Step 4: Run the full suites**

Run: `cd ~/Documenti/Rombo/web && npx ng test --watch=false && npx playwright test 2>&1 | tail -8 && cd .. && npm test 2>&1 | tail -6`
Expected: web verdi, e2e (nuovi e vecchi) verdi, 15 test del guscio verdi.

- [ ] **Step 5: README**

In `README.md` (radice), nella sezione che descrive le funzioni dell'app, aggiungi un paragrafo:

```md
### Schema logico

Accanto al diagramma ER c'è lo **schema logico relazionale**, modificabile a mano: l'interruttore **ER | Logico**
nella barra cambia modo. Dal modo Logico «Genera dall'ER» crea una copia delle tabelle (una sola volta: poi è
indipendente dall'ER, e rigenerare chiede conferma); in alternativa si parte da zero con lo strumento Tabella (T).
Le tabelle si spostano sul foglio, le colonne si modificano dal pannello Proprietà (PK, NULL, UNIQUE, tipo, ordine) e
le chiavi esterne si creano dal pannello o trascinando il pallino di una colonna su un'altra tabella. Lo schema sta
nello stesso file `.rombo`; i pannelli «Schema logico» e «SQL» e il menu Esporta lavorano sullo schema del modo attivo.
```

- [ ] **Step 6: Commit**

```bash
cd ~/Documenti/Rombo
git add web/e2e/logical.spec.ts web/e2e/fixtures/er-semplice.json README.md
git commit -m "test(e2e): schema logico dalla generazione all'esportazione; docs: README"
```

---

## Self-Review

**Spec coverage**
- Obiettivo (editor a mano, generazione, `.rombo`, notazione, SQL): Task 1 (file), 2 (modifica), 4 (adattatore + generazione), 8–10 (UI), 11 (e2e).
- Decisione 1 (snapshot indipendente + conferma): Task 7 (`requestGenerate`, `generateLogical`), Task 10 (dialogo).
- Decisione 2 (campo `logical`, version 1): Task 1.
- Decisione 3 (un editor, due modi, undo unico): Task 7 (store), Task 10 (interruttore, editor-page).
- Decisione 4 (adattatore, formatter esistenti): Task 4, 9 (pannelli), 10 (menu Esporta).
- Modello dati e limiti zod, `referencesOk`: Task 1.
- Comandi (elenco della spec): Task 2 (`generateLogical`/`clearLogical` coperti da Task 4/2).
- Validazione (spec emendata): Task 5; pannello Problemi per modo: Task 9.
- Editor: canvas (rinomina inline, trascinamento, FK da maniglia), form completo da tastiera, palette, pulsante Genera, pannelli per modo, export immagine: Task 8, 9, 10.
- Compatibilità/sicurezza: Global Constraints; nessuna IPC nuova.
- Test (dominio, equivalenza, serialize, componenti, e2e + axe, suite esistente verde): Task 1–11.
- Fuori scopo rispettato (nessuna sincronizzazione, nessun auto-layout dopo le modifiche: «L» è esplicito).

**Placeholder scan:** nessun TBD/TODO; le uniche istruzioni "invariato" si riferiscono a corpi di funzioni esistenti con indicazione di dove modificarli (Task 7 `paste`/`nudge`, Task 10 `exportImage`).

**Type consistency:** `LTable/LColumn/LForeignKey/LCheck/LogicalDiagram` (Task 1) usati con gli stessi nomi in tutti i task; `addForeignKey(d, tableId, columnIds, refTableId): Created` e `checkForeignKey` coerenti fra Task 2, 7, 9; `FkEdge`/`tableRect`/`rowY` (Task 3) usati identici nel Task 8; `store.schema/activeIssues/activeErrorCount/logicalIssues/mode/confirmRegenerate` (Task 7) usati nei Task 8–10; `Tool` include `'table'` dal Task 7 prima che Task 8/10 lo usino; `data-ltable`/`data-lcol`/`.lg-fk`/`.lg-handle` definiti nel Task 8 e usati identici nel Task 11.

**Review Focus:** (1) colonna eliminata → Task 2 test; (2) rinomina con FK → Task 4 e Task 8 test; (3) nomi vuoti/duplicati → Task 5 e Task 9 (callout); (4) rigenerare + undo → Task 7 test e Task 10 dialogo; (5) FK impossibili → Task 2 `checkForeignKey` e Task 7 `addForeignKeyFromColumn`.
