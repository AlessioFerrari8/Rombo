# Editor dello schema logico — design

Data: 2026-10-10 · Branch: `feat/schema-logico` · App: `web/` (Angular 22)

## Obiettivo

Disegnare **a mano** lo schema logico relazionale dentro Rombo, come passo successivo al diagramma ER (uso scolastico). Lo schema si genera dall'ER con un pulsante, poi si modifica liberamente e si salva nello stesso file `.rombo`. Notazione testuale e SQL devono funzionare anche sullo schema modificato a mano.

Resta tutto locale (nessun account, nessun server).

## Stato attuale (non da rifare)

- `domain/logical.ts`: `toLogical(Diagram)` produce un `LogicalSchema` (tabelle per nome) derivato dall'ER; gestisce N:N, multivalore, composti, generalizzazioni (3 strategie), `fkOn`. `formatLogical` produce la notazione `TABELLA(pk, fk→T, nullable*)`.
- `domain/ddl.ts`: `toDDL(schema, 'postgres'|'mysql')`.
- Pannelli "Schema logico" e "SQL": **solo lettura**, ricalcolati a ogni modifica dell'ER (`EditorStore.logical`).

Manca: modello **modificabile e persistente**, canvas a tabelle con frecce FK, comandi di modifica, validazione, generazione "snapshot".

## Decisioni

1. **Rapporto con l'ER: indipendente dopo la generazione.** "Genera dall'ER" crea una copia (snapshot); da lì è un diagramma a sé. Se l'ER cambia si rigenera a richiesta, con conferma se lo schema logico esiste già. Nessuna sincronizzazione continua né override.
2. **Persistenza: campo opzionale `logical` dentro `Diagram`.** `version` resta `1`; i file vecchi restano validi. Si ereditano gratis storia undo/redo, salvataggio, import/export, menu File del guscio.
3. **Un solo editor, due modi.** Interruttore **ER | Logico** nella barra; il modo Logico sostituisce canvas e pannello laterale. La storia undo è unica.
4. **Notazione e SQL senza codice nuovo di formattazione**: un adattatore converte il modello a id nel `Table` per nomi già esistente.

## Modello dati

```ts
interface LColumn { id: Id; name: string; type: string; nullable: boolean }
interface LForeignKey { id: Id; columnIds: Id[]; refTableId: Id; refColumnIds: Id[] }
interface LCheck { columnId: Id; values: string[] }   // enum dal generatore (CHECK ... IN)
interface LTable {
  id: Id; name: string; pos: Point;          // pos = angolo alto-sinistra della casella
  columns: LColumn[];
  primaryKey: Id[];                          // id di colonne
  uniques: Id[][];
  foreignKeys: LForeignKey[];
  checks: LCheck[];
}
interface LogicalDiagram { tables: LTable[] }
// Diagram: logical?: LogicalDiagram
```

- Le FK puntano a **id**: rinominare tabelle o colonne non le rompe.
- `Table.sourceId` dell'esistente non serve nel modello modificabile (resta nel derivato).
- Zod (`serialize.ts`): `logical` opzionale con limiti (≤300 tabelle, ≤100 colonne per tabella, nomi ≤80). `referencesOk` verifica che PK/unique/FK/check puntino a colonne e tabelle esistenti, e che `columnIds` e `refColumnIds` di una FK abbiano la stessa lunghezza. File non valido → errore già gestito dal flusso di import.

## Generazione

`generateLogical(d: Diagram): LogicalDiagram` in `domain/logical-edit.ts` (nome definitivo da fissare nel piano):

- parte da `toLogical(d)` (richiede ER senza errori);
- assegna id nuovi, mappa nomi → id per PK/unique/FK/check;
- posizioni iniziali con ELK (`editor/layout.ts`, nuovo `computeLogicalLayout`): nodi = tabelle, archi = FK, dimensioni dalla casella.
- Pulsante "Genera dall'ER" disattivato se l'ER ha errori (stesso messaggio del pannello Problemi). Se `logical` esiste: dialogo di conferma che avvisa della perdita delle modifiche a mano. Un'unica azione di undo.
- "Nuova tabella" permette di partire da zero (anche con ER vuoto).

## Comandi (`domain/logical-commands.ts`, puri come `commands.ts`)

`addTable`, `renameTable`, `moveTables`, `setTablePositions`, `deleteTables` (toglie anche le FK che puntano alle tabelle eliminate), `addColumn`, `updateColumn` (nome/tipo/nullable), `moveColumn` (riordino), `deleteColumn` (la toglie da PK/unique/FK/check; le FK che ne perdono una colonna vengono eliminate), `setPrimaryKey` (toggle colonna), `setUnique` (insiemi), `addForeignKey` / `updateForeignKey` / `deleteForeignKey`, `generateLogical`, `clearLogical`.

- `addForeignKey(tableId, columnIds, refTableId)`: le colonne di destinazione sono la PK della tabella riferita; se la PK è composta e `columnIds` ha lunghezza diversa → errore di validazione, non crash.
- Nomi nuovi con `uniqueName` esistente.

## Validazione (`validateLogical`, stessi `Issue` del pannello Problemi)

Errori: nome vuoto, nome tabella duplicato, nome colonna duplicato nella stessa tabella, nome non valido per SQL (usa `ident`), FK con numero colonne ≠ PK di destinazione, FK verso tabella senza PK, tipo SQL non valido (`SQL_TYPE_RE`), nome oltre 60 caratteri.
Avvisi: tabella senza PK, tabella senza colonne, colonna PK nullable, FK con tipi diversi dalla colonna riferita.

Il pannello Problemi mostra i problemi del modo attivo (ER o Logico). `errorCount` riflette il modo attivo.

## Editor

- `EditorStore`: `mode: 'er' | 'logical'` (segnale, non persistito nel file), `logicalDiagram` derivato da `diagram().logical`. Selezione e `tool` per modo.
- `LogicalCanvas` (nuovo componente, **riusa** `domain/viewport` per zoom/pan e la stessa logica di drag/anteprima/commit dello store):
  - casella tabella: intestazione col nome, una riga per colonna con icona PK / FK, tipo in grigio, `*` se nullable (stessa notazione del testo);
  - frecce FK dalla riga della colonna alla casella di destinazione (percorso ortogonale semplice, con marcatore a freccia);
  - doppio clic su nome tabella/colonna → rinomina inline;
  - trascinare la casella la sposta; trascinare da una colonna a un'altra tabella crea una FK (anteprima della freccia durante il gesto).
- `LogicalProperties` (pannello laterale, **form completo**, percorso da tastiera): nome tabella; elenco colonne con nome, tipo (riusa `type-picker`), PK, NULL, UNIQUE, ordine su/giù, elimina; sezione chiavi esterne con scelta colonne e tabella riferita. Tutto ciò che si fa col mouse sul canvas si fa anche da qui.
- Palette (a sinistra) in modo Logico: strumento "Tabella" (clic sul canvas per crearla) e selezione. Pulsante "Genera dall'ER" nella barra del modo Logico.
- Pannelli "Schema logico" e "SQL": usano lo schema a mano se `logical` esiste, altrimenti il derivato attuale. Per lo schema a mano passano dall'adattatore `toTables(logical): LogicalSchema` (id → nomi) e dai formatter esistenti. Con errori di validazione logica: stesso callout "correggi i problemi" già usato.
- Export immagine (`exporter.ts`): in modo Logico esporta il canvas logico (PNG/SVG), riusando la pipeline esistente.

## Compatibilità e sicurezza

- File senza `logical` identici a oggi; `erdrawer` e import invariati.
- Rombo/desktop: nessun cambiamento al guscio; nessuna nuova IPC.
- Nessuna dipendenza nuova (ELK e zod già presenti). Il CSP non cambia.

## Test

- **Dominio** (vitest/jsdom come gli altri): comandi, cancellazioni a cascata, validazione, `toTables`, `generateLogical`.
- **Equivalenza**: `generateLogical(carrozzeria)` → `toTables` → `toDDL` uguale byte per byte al `toDDL(toLogical(carrozzeria))` delle fixture esistenti (Postgres e MySQL).
- **Serialize**: round-trip con `logical`; rifiuto di riferimenti spezzati e lunghezze FK incoerenti; file vecchio senza `logical` ancora valido.
- **Componenti**: `LogicalCanvas` (render tabelle e frecce, creazione FK da drag, rinomina), `LogicalProperties` (form), conferma di rigenerazione, interruttore di modo.
- **E2E Playwright**: ER di esempio → Logico → genera → rinomina colonna → crea FK → copia notazione e SQL → salva e riapri il file `.rombo` → lo schema c'è. Controllo axe sul modo Logico.
- Il suite esistente (192 web + 15 guscio) deve restare verde.

## Fuori scopo

Sincronizzazione continua ER↔logico; auto-layout dopo le modifiche; viste, indici non unique, trigger; importare SQL esistente; firma/auto-update del desktop.
