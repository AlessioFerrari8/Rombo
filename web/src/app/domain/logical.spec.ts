import {
  addAttribute, addEntity, addGeneralization, addRelationship, createDiagram, setAlternates, setExternalVia, setFkOn,
  toggleIdentifierAttribute, updateGeneralization, updateParticipant,
} from './commands';
import { AttrCard, Id } from './model';
import { formatLogical, ident, toLogical } from './logical';

class B {
  d = createDiagram();
  ent(name: string, key: string[], others: Array<[string, AttrCard?]> = []): Id {
    const e = addEntity(this.d, { x: 0, y: 0 }, name);
    this.d = e.diagram;
    for (const k of key) {
      const a = addAttribute(this.d, e.id, k);
      this.d = toggleIdentifierAttribute(a.diagram, e.id, a.id);
    }
    for (const [n, c] of others) this.d = addAttribute(this.d, e.id, n, c ?? '1,1').diagram;
    return e.id;
  }
  rel(name: string, parts: Array<[Id, string, string?]>): Id {
    const r = addRelationship(this.d, parts.map((p) => p[0]), undefined, name);
    this.d = r.diagram;
    parts.forEach(([, card, role], i) => {
      const [mn, mx] = card.split(',');
      this.d = updateParticipant(this.d, r.id, i, { min: mn === '0' ? 0 : 1, max: mx === 'N' ? 'N' : 1, role });
    });
    return r.id;
  }
  isa(parent: Id, children: Id[], total: boolean, exclusive: boolean, strategy?: 'merge-up' | 'merge-down' | 'replace'): Id {
    const g = addGeneralization(this.d, parent, children);
    this.d = updateGeneralization(g.diagram, g.id, { total, exclusive, strategy });
    return g.id;
  }
  table(name: string) {
    const t = toLogical(this.d).tables.find((x) => x.name === name);
    if (!t) throw new Error(`manca la tabella ${name}`);
    return t;
  }
  tableNames() {
    return toLogical(this.d).tables.map((t) => t.name);
  }
}

describe('ident', () => {
  it('rende SQL i nomi con accenti, spazi, apostrofi e cifre iniziali', () => {
    expect(ident('Città')).toBe('Citta');
    expect(ident("Tipo d'intervento")).toBe('Tipo_d_intervento');
    expect(ident('3D')).toBe('T_3D');
    expect(ident('  ')).toBe('X');
  });
});

describe('toLogical', () => {
  it("un'entita con l'accento diventa una tabella dal nome valido", () => {
    const b = new B();
    b.ent('Città', ['Nome']);
    expect(b.tableNames()).toEqual(['Citta']);
  });

  it('1:N mette la chiave esterna sul lato (x,1), NOT NULL se il minimo e 1', () => {
    const b = new B();
    const p = b.ent('Proprietario', ['CF']);
    const a = b.ent('Auto', ['Targa']);
    b.rel('possiede', [[p, '1,N'], [a, '1,1']]);
    const t = b.table('Auto');
    expect(t.columns).toContainEqual({ name: 'CF_Proprietario', type: 'VARCHAR(255)', nullable: false });
    expect(t.foreignKeys).toEqual([{ columns: ['CF_Proprietario'], refTable: 'Proprietario', refColumns: ['CF'] }]);
    expect(b.table('Proprietario').foreignKeys).toEqual([]);
  });

  it('con (0,1) la chiave esterna puo essere NULL', () => {
    const b = new B();
    const p = b.ent('Proprietario', ['CF']);
    const a = b.ent('Auto', ['Targa']);
    b.rel('possiede', [[p, '0,N'], [a, '0,1']]);
    expect(b.table('Auto').columns).toContainEqual({ name: 'CF_Proprietario', type: 'VARCHAR(255)', nullable: true });
  });

  it('N:N diventa una tabella ponte con gli attributi della associazione', () => {
    const b = new B();
    const s = b.ent('Studente', ['Matricola']);
    const c = b.ent('Corso', ['Codice']);
    const r = b.rel('frequenta', [[s, '0,N'], [c, '0,N']]);
    b.d = addAttribute(b.d, r, 'Voto').diagram;
    const t = b.table('frequenta');
    expect(t.primaryKey).toEqual(['Matricola_Studente', 'Codice_Corso']);
    expect(t.columns.map((x) => x.name)).toEqual(['Matricola_Studente', 'Codice_Corso', 'Voto']);
    expect(t.foreignKeys.map((f) => f.refTable)).toEqual(['Studente', 'Corso']);
  });

  it('1:1 mette la chiave esterna sul lato (1,1) e la rende UNIQUE', () => {
    const b = new B();
    const p = b.ent('Persona', ['CF']);
    const pa = b.ent('Patente', ['Numero']);
    b.rel('ha', [[p, '0,1'], [pa, '1,1']]);
    expect(b.table('Patente').uniques).toEqual([['CF_Persona']]);
    expect(b.table('Persona').foreignKeys).toEqual([]);
  });

  it("1:1 simmetrico: di default la prima entita, poi decide fkOn", () => {
    const b = new B();
    const x = b.ent('Nazione', ['Nome']);
    const y = b.ent('Capitale', ['Nome']);
    const r = b.rel('ha', [[x, '0,1'], [y, '0,1']]);
    expect(b.table('Nazione').foreignKeys).toHaveLength(1);
    b.d = setFkOn(b.d, r, y);
    expect(b.table('Nazione').foreignKeys).toHaveLength(0);
    expect(b.table('Capitale').foreignKeys).toHaveLength(1);
  });

  it('un attributo multivalore diventa una tabella', () => {
    const b = new B();
    b.ent('Persona', ['CF'], [['Telefono', '0,N']]);
    const t = b.table('Persona_Telefono');
    expect(t.primaryKey).toEqual(['CF_Persona', 'Telefono']);
    expect(t.foreignKeys).toEqual([{ columns: ['CF_Persona'], refTable: 'Persona', refColumns: ['CF'] }]);
    expect(b.table('Persona').columns.map((c) => c.name)).toEqual(['CF']);
  });

  it("l'identificatore esterno diventa una chiave composta, senza colonne doppie", () => {
    const b = new B();
    const s = b.ent('Squadra', ['Nome']);
    const g = b.ent('Giocatore', ['Numero']);
    const r = b.rel('gioca', [[g, '1,1'], [s, '1,N']]);
    b.d = setExternalVia(b.d, g, [r]);
    const t = b.table('Giocatore');
    expect(t.primaryKey).toEqual(['Numero', 'Nome_Squadra']);
    expect(t.columns.map((c) => c.name)).toEqual(['Numero', 'Nome_Squadra']);
    expect(t.foreignKeys).toEqual([{ columns: ['Nome_Squadra'], refTable: 'Squadra', refColumns: ['Nome'] }]);
  });

  it('ricorsiva 1:N: la chiave esterna prende il nome dal ruolo', () => {
    const b = new B();
    const d = b.ent('Dipendente', ['Matricola']);
    b.rel('supervisiona', [[d, '0,N', 'capo'], [d, '0,1', 'sottoposto']]);
    const t = b.table('Dipendente');
    expect(t.columns.map((c) => c.name)).toEqual(['Matricola', 'Matricola_capo']);
    expect(t.foreignKeys[0].refTable).toBe('Dipendente');
  });

  it('ricorsiva N:N: due colonne distinte', () => {
    const b = new B();
    const p = b.ent('Persona', ['CF']);
    b.rel('amicizia', [[p, '0,N', 'primo'], [p, '0,N', 'secondo']]);
    expect(b.table('amicizia').primaryKey).toEqual(['CF_primo', 'CF_secondo']);
  });

  it('IS-A figli nel padre: attributi dei figli opzionali, discriminante, associazioni spostate sul padre', () => {
    const b = new B();
    const dip = b.ent('Dipendente', ['Matricola']);
    const mec = b.ent('Meccanico', [], [['Specializzazione']]);
    const seg = b.ent('Segretario', []);
    const auto = b.ent('Auto', ['Targa']);
    b.isa(dip, [mec, seg], true, true);
    b.rel('ripara', [[mec, '1,N'], [auto, '1,1']]);
    expect(b.tableNames()).toEqual(['Dipendente', 'Auto']);
    const t = b.table('Dipendente');
    expect(t.columns).toContainEqual({ name: 'Specializzazione', type: 'VARCHAR(255)', nullable: true });
    expect(t.columns).toContainEqual({ name: 'Tipo', type: 'VARCHAR(50)', nullable: false });
    expect(t.checks).toEqual([{ column: 'Tipo', values: ['Meccanico', 'Segretario'] }]);
    expect(b.table('Auto').columns.map((c) => c.name)).toContain('Matricola_Dipendente');
  });

  it('IS-A sovrapposta: una colonna booleana per figlio', () => {
    const b = new B();
    const dip = b.ent('Dipendente', ['Matricola']);
    const mec = b.ent('Meccanico', []);
    b.isa(dip, [mec], false, false);
    expect(b.table('Dipendente').columns).toContainEqual({ name: 'E_Meccanico', type: 'BOOLEAN', nullable: false });
  });

  it('IS-A padre nei figli: il padre sparisce e le sue associazioni si duplicano', () => {
    const b = new B();
    const dip = b.ent('Dipendente', ['Matricola'], [['Nome']]);
    const mec = b.ent('Meccanico', [], [['Specializzazione']]);
    const seg = b.ent('Segretario', []);
    const rep = b.ent('Reparto', ['Codice']);
    b.isa(dip, [mec, seg], true, true, 'merge-down');
    b.rel('lavora_in', [[dip, '1,1'], [rep, '0,N']]);
    expect(b.tableNames()).toEqual(['Meccanico', 'Segretario', 'Reparto']);
    const m = b.table('Meccanico');
    expect(m.primaryKey).toEqual(['Matricola']);
    expect(m.columns.map((c) => c.name)).toEqual(['Matricola', 'Nome', 'Specializzazione', 'Codice_Reparto']);
  });

  it('IS-A sostituita da associazioni: il figlio usa la chiave del padre come chiave esterna', () => {
    const b = new B();
    const dip = b.ent('Dipendente', ['Matricola']);
    const mec = b.ent('Meccanico', [], [['Specializzazione']]);
    b.isa(dip, [mec], false, true, 'replace');
    const m = b.table('Meccanico');
    expect(m.primaryKey).toEqual(['Matricola']);
    expect(m.foreignKeys).toEqual([{ columns: ['Matricola'], refTable: 'Dipendente', refColumns: ['Matricola'] }]);
  });
});

describe('toLogical — casi limite (fix round 1)', () => {
  it('A: gerarchia a 3 livelli, replace sotto + merge-up sopra: nessun crash, la FK del nipote segue il padre risultante', () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF']);
    const dip = b.ent('Dipendente', [], [['Stipendio']]);
    const mec = b.ent('Meccanico', [], [['Spec']]);
    b.isa(persona, [dip], true, true, 'merge-up');
    b.isa(dip, [mec], true, true, 'replace');
    expect(b.tableNames()).toEqual(['Persona', 'Meccanico']);
    const p = b.table('Persona');
    expect(p.columns).toEqual([
      { name: 'CF', type: 'VARCHAR(255)', nullable: false },
      { name: 'Stipendio', type: 'VARCHAR(255)', nullable: true },
      { name: 'Tipo', type: 'VARCHAR(50)', nullable: false },
    ]);
    const m = b.table('Meccanico');
    expect(m.primaryKey).toEqual(['CF']);
    expect(m.foreignKeys).toEqual([{ columns: ['CF'], refTable: 'Persona', refColumns: ['CF'] }]);
  });

  it('B: gerarchia a 3 livelli, padre nei figli a catena: tutto confluisce nel discendente finale con la chiave giusta', () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF']);
    const dip = b.ent('Dipendente', [], [['Stipendio']]);
    const mec = b.ent('Meccanico', [], [['Spec']]);
    b.isa(persona, [dip], true, true, 'merge-down');
    b.isa(dip, [mec], true, true, 'merge-down');
    expect(b.tableNames()).toEqual(['Meccanico']);
    const m = b.table('Meccanico');
    expect(m.primaryKey).toEqual(['CF']);
    expect(m.columns.map((c) => c.name)).toEqual(['CF', 'Stipendio', 'Spec']);
  });

  it('C: gerarchia a 3 livelli, figli nel padre a catena: il discriminatore interno non sparisce', () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF']);
    const dip = b.ent('Dipendente', [], [['Stipendio']]);
    const mec = b.ent('Meccanico', [], [['Spec']]);
    const seg = b.ent('Segretario', []);
    b.isa(persona, [dip], false, true);
    b.isa(dip, [mec, seg], true, true);
    expect(b.tableNames()).toEqual(['Persona']);
    const p = b.table('Persona');
    expect(p.checks).toEqual([
      { column: 'Tipo', values: ['Meccanico', 'Segretario'] },
      { column: 'Tipo_Persona', values: ['Dipendente'] },
    ]);
    // «Tipo» viene ereditato dal livello sottostante (Dipendente): sale nel padre come un
    // attributo normale (optionalCard), quindi diventa nullable anche se la sua gerarchia
    // originale era totale — una Persona che non è nemmeno un Dipendente non ha un «Tipo».
    expect(p.columns).toContainEqual({ name: 'Tipo', type: 'VARCHAR(50)', nullable: true });
    expect(p.columns).toContainEqual({ name: 'Tipo_Persona', type: 'VARCHAR(50)', nullable: true });
  });

  it("D: due gerarchie sullo stesso padre: due discriminatori distinti, non uno che sovrascrive l'altro", () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF']);
    const uomo = b.ent('Uomo', []);
    const donna = b.ent('Donna', []);
    const studente = b.ent('Studente', []);
    const lavoratore = b.ent('Lavoratore', []);
    b.isa(persona, [uomo, donna], true, true, 'merge-up');
    b.isa(persona, [studente, lavoratore], false, true, 'merge-up');
    const p = b.table('Persona');
    expect(p.checks).toEqual([
      { column: 'Tipo', values: ['Uomo', 'Donna'] },
      { column: 'Tipo_Persona', values: ['Studente', 'Lavoratore'] },
    ]);
  });

  it('E: nomi tabella collidenti dopo ident() (Città/Citta): la FK punta al nome vero dopo il dedup', () => {
    const b = new B();
    b.ent('Città', ['Nome']);
    const citta2 = b.ent('Citta', ['Cod']);
    const via = b.ent('Via', ['Nome']);
    b.rel('in', [[via, '1,1'], [citta2, '0,N']]);
    expect(b.tableNames()).toEqual(['Citta', 'Citta_2', 'Via']);
    expect(b.table('Via').foreignKeys).toEqual([{ columns: ['Cod_Citta'], refTable: 'Citta_2', refColumns: ['Cod'] }]);
  });

  it("F: un'entità con lo stesso nome della tabella satellite di un multivalore: l'entità mantiene il nome, il satellite viene rinominato", () => {
    const b = new B();
    b.ent('Persona', ['CF'], [['Telefono', '0,N']]);
    const real = b.ent('Persona_Telefono', ['Id']);
    const chiamata = b.ent('Chiamata', ['N']);
    b.rel('fatta', [[chiamata, '1,1'], [real, '0,N']]);
    expect(b.tableNames()).toEqual(['Persona', 'Persona_Telefono', 'Chiamata', 'Persona_Telefono_2']);
    expect(b.table('Persona_Telefono').columns.map((c) => c.name)).toEqual(['Id']);
    expect(b.table('Chiamata').foreignKeys).toEqual([
      { columns: ['Id_Persona_Telefono'], refTable: 'Persona_Telefono', refColumns: ['Id'] },
    ]);
    expect(b.table('Persona_Telefono_2').foreignKeys).toEqual([
      { columns: ['CF_Persona'], refTable: 'Persona', refColumns: ['CF'] },
    ]);
  });

  it('G: identificazione esterna 1:1 con entrambi i lati (1,1): niente FK duplicata né ciclo', () => {
    const b = new B();
    const ordine = b.ent('Ordine', ['Num']);
    const fattura = b.ent('Fattura', ['Riga']);
    const r = b.rel('genera', [[ordine, '1,1'], [fattura, '1,1']]);
    b.d = setExternalVia(b.d, fattura, [r]);
    expect(b.table('Ordine').foreignKeys).toEqual([]);
    const f = b.table('Fattura');
    expect(f.primaryKey).toEqual(['Riga', 'Num_Ordine']);
    expect(f.foreignKeys).toEqual([{ columns: ['Num_Ordine'], refTable: 'Ordine', refColumns: ['Num'] }]);
  });

  it("H: entità debole identificata tramite un'associazione coinvolta in un merge-down: mantiene la chiave, con nota sull'ambiguità", () => {
    const b = new B();
    const dip = b.ent('Dipendente', ['Matricola']);
    const mec = b.ent('Meccanico', []);
    const seg = b.ent('Segretario', []);
    const badge = b.ent('Badge', ['Num']);
    b.isa(dip, [mec, seg], true, true, 'merge-down');
    const r = b.rel('assegnato', [[badge, '1,1'], [dip, '1,1']]);
    b.d = setExternalVia(b.d, badge, [r]);
    const schema = toLogical(b.d);
    const bd = schema.tables.find((t) => t.name === 'Badge')!;
    expect(bd.primaryKey).toEqual(['Num', 'Matricola_Meccanico']);
    expect(bd.foreignKeys).toEqual([{ columns: ['Matricola_Meccanico'], refTable: 'Meccanico', refColumns: ['Matricola'] }]);
    expect(schema.notes.some((n) => n.includes('duplicata per ogni figlio'))).toBe(true);
  });

  it('uniques usa il nome colonna reale dopo il dedup, non ident() grezzo', () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF'], [['Città'], ['Citta']]);
    const e = b.d.entities.find((x) => x.id === persona)!;
    const citta2Id = e.attributes.find((a) => a.name === 'Citta')!.id;
    b.d = setAlternates(b.d, persona, [[citta2Id]]);
    expect(b.table('Persona').uniques).toEqual([['Citta_2']]);
  });

  it('fkOn viene ignorato se il 1:1 non è ambiguo (min diversi): vale la regola del lato (1,1)', () => {
    const b = new B();
    const x = b.ent('X', ['A']);
    const y = b.ent('Y', ['B']);
    const r = b.rel('r', [[x, '0,1'], [y, '1,1']]);
    b.d = setFkOn(b.d, r, x);
    expect(b.table('X').foreignKeys).toEqual([]);
    expect(b.table('Y').foreignKeys).toEqual([{ columns: ['A_X'], refTable: 'X', refColumns: ['A'] }]);
  });
});

describe('toLogical — casi limite (fix round 2)', () => {
  it('X4: merge-down unisce i discriminatori del padre e del figlio, non sovrascrive', () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF']);
    const dip = b.ent('Dipendente', []);
    const mec = b.ent('Meccanico', []);
    const seg = b.ent('Segretario', []);
    const uomo = b.ent('Uomo', []);
    const donna = b.ent('Donna', []);
    // dip diventa parent di un merge-up (assorbe mec/seg) e figlio di un merge-down (riceve persona):
    // il figlio "sopravvissuto" (dip) deve avere ENTRAMBI i discriminatori, non solo l'ultimo assegnato.
    b.isa(dip, [mec, seg], true, true, 'merge-up');
    b.isa(persona, [uomo, donna], true, true, 'merge-up');
    b.isa(persona, [dip], true, true, 'merge-down');
    expect(b.tableNames()).toEqual(['Dipendente']);
    const t = b.table('Dipendente');
    expect(t.checks).toEqual([
      { column: 'Tipo', values: ['Uomo', 'Donna'] },
      { column: 'Tipo_Dipendente', values: ['Meccanico', 'Segretario'] },
    ]);
  });

  it('X6: uno UNIQUE che include un attributo chiave mantiene tutte le colonne', () => {
    const b = new B();
    const persona = b.ent('Persona', ['CF'], [['Email']]);
    const e = b.d.entities.find((x) => x.id === persona)!;
    b.d = setAlternates(b.d, persona, [[e.attributes[0].id, e.attributes[1].id]]);
    expect(b.table('Persona').uniques).toEqual([['CF', 'Email']]);
  });

  it("la nota sull'ambiguità non compare se nessuno usa la copia duplicata per identificarsi", () => {
    const b = new B();
    const dip = b.ent('Dipendente', ['Matricola']);
    const mec = b.ent('Meccanico', []);
    const seg = b.ent('Segretario', []);
    const rep = b.ent('Reparto', ['Codice']);
    b.isa(dip, [mec, seg], true, true, 'merge-down');
    b.rel('lavora_in', [[dip, '1,1'], [rep, '0,N']]);
    const schema = toLogical(b.d);
    expect(schema.notes.some((n) => n.includes('duplicata per ogni figlio'))).toBe(false);
  });
});

describe('formatLogical', () => {
  it('sottolinea la chiave, mette la freccia sulle esterne e l\'asterisco sulle opzionali', () => {
    const b = new B();
    const p = b.ent('Proprietario', ['CF'], [['Telefono', '0,1']]);
    const a = b.ent('Auto', ['Targa']);
    b.rel('possiede', [[p, '1,N'], [a, '1,1']]);
    expect(formatLogical(toLogical(b.d)).split('\n')).toEqual([
      'PROPRIETARIO(_CF_, Telefono*)',
      'AUTO(_Targa_, CF_Proprietario→PROPRIETARIO)',
      '',
      'Legenda: _x_ chiave primaria · x→T chiave esterna verso T · x* può essere NULL',
    ]);
  });
});
