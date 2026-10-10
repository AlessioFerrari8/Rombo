import { Attribute, Diagram, Entity } from './model';
import { generateLogical } from './logical-schema';
import { addAttribute, addEntity, addRelationship, createDiagram, updateParticipant } from './commands';
import { parseDiagramFile, serializeDiagram } from './serialize';

function sample() {
  let d = createDiagram('Prova');
  const a = addEntity(d, { x: 0, y: 0 }, 'A'); d = a.diagram;
  const b = addEntity(d, { x: 100, y: 0 }, 'B'); d = b.diagram;
  d = addAttribute(d, a.id, 'Codice').diagram;
  d = addRelationship(d, [a.id, b.id], undefined, 'lega').diagram;
  return d;
}

describe('parseDiagramFile', () => {
  it('rilegge quello che scrive, con un id nuovo', () => {
    const d = sample();
    const r = parseDiagramFile(serializeDiagram(d));
    if (!r.ok) throw new Error(r.error);
    expect(r.source).toBe('diagrammier');
    expect({ ...r.diagram, id: d.id }).toEqual(d);
    expect(r.diagram.id).not.toBe(d.id);
  });

  it('conserva una molteplicita\' numerica come (1,25)', () => {
    let d = sample();
    d = updateParticipant(d, d.relationships[0].id, 1, { min: 1, max: 25 });
    const r = parseDiagramFile(serializeDiagram(d));
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.relationships[0].participants[1].max).toBe(25);
  });

  it('JSON rotto', () => {
    expect(parseDiagramFile('{')).toEqual({ ok: false, error: 'Il file non è JSON valido.' });
  });

  it('dice dove sta il campo sbagliato, in italiano', () => {
    const bad = JSON.parse(serializeDiagram(sample()));
    bad.entities[0].pos.x = 'dieci';
    const r = parseDiagramFile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('entities.0.pos.x');
      expect(r.error).toContain('tipo sbagliato');
    }
  });

  it('rifiuta i riferimenti rotti', () => {
    const bad = JSON.parse(serializeDiagram(sample()));
    bad.relationships[0].participants[0].entityId = 'non-esiste';
    const r = parseDiagramFile(JSON.stringify(bad));
    expect(r).toEqual({ ok: false, error: 'File non valido: ci sono collegamenti verso elementi che non esistono.' });
  });

  it('riconosce i file di erdrawer', () => {
    const r = parseDiagramFile(JSON.stringify({ version: 1, entities: [], relationships: [], isaRelations: [] }));
    expect(r.ok && r.source).toBe('erdrawer');
  });

  it('rifiuta un file erdrawer con un numero al posto sbagliato, senza esplodere', () => {
    const bad = {
      version: 1,
      entities: [{ uuid: 'e1', name: 'A', x: 'dieci', y: 0, width: 10, height: 10, attributes: [] }],
      relationships: [],
      isaRelations: [],
    };
    const r = parseDiagramFile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('entities.0.x');
      expect(r.error).toContain('tipo sbagliato');
    }
  });

  it('rifiuta un file erdrawer con entityUUIDs mancante, senza TypeError', () => {
    const bad = {
      version: 1,
      entities: [{ uuid: 'e1', name: 'A', x: 0, y: 0, width: 10, height: 10, attributes: [] }],
      relationships: [{ uuid: 'r1', name: 'R', rhombusX: 0, rhombusY: 0 }],
      isaRelations: [],
    };
    const r = parseDiagramFile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('relationships.0.entityUUIDs');
      expect(r.error).toContain('campo mancante');
    }
  });

  it('rifiuta un file erdrawer con un attributo senza circleX', () => {
    const bad = {
      version: 1,
      entities: [
        {
          uuid: 'e1', name: 'A', x: 0, y: 0, width: 10, height: 10,
          attributes: [{ uuid: 'a1', name: 'Attr', circleY: 0 }],
        },
      ],
      relationships: [],
      isaRelations: [],
    };
    const r = parseDiagramFile(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('entities.0.attributes.0.circleX');
  });
});

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

  it('rifiuta id di FK duplicati nella stessa tabella', () => {
    const l = logical();
    l.tables[1].foreignKeys.push({ ...l.tables[1].foreignKeys[0] });
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta id di FK duplicati tra tabelle diverse', () => {
    const l = logical();
    l.tables[0].foreignKeys.push({ id: 'f1', columnIds: ['c1'], refTableId: 't1', refColumnIds: ['c1'] });
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta un id di FK uguale a quello di una tabella', () => {
    const l = logical();
    l.tables[1].foreignKeys[0].id = 't1';
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta una colonna ripetuta nella PK', () => {
    const l = logical();
    l.tables[0].primaryKey = ['c1', 'c1'];
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta una colonna ripetuta in una UNIQUE', () => {
    const l = logical();
    l.tables[1].uniques = [['c3', 'c3']];
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta una colonna ripetuta tra le colonne di una FK', () => {
    const l = logical();
    l.tables[1].foreignKeys[0] = { id: 'f1', columnIds: ['c3', 'c3'], refTableId: 't2', refColumnIds: ['c2', 'c3'] };
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });

  it('rifiuta una colonna ripetuta tra le colonne riferite da una FK', () => {
    const l = logical();
    l.tables[1].foreignKeys[0] = { id: 'f1', columnIds: ['c2', 'c3'], refTableId: 't2', refColumnIds: ['c2', 'c2'] };
    expect(parseDiagramFile(serializeDiagram({ ...sample(), logical: l })).ok).toBe(false);
  });
});

describe('schema logico generato da un ER ai limiti', () => {
  const long = (prefix: string, i: number) => `${prefix}${String(i).padStart(4, '0')}`.padEnd(80, 'x');

  /** Entita' con attributi da 80 caratteri: la chiave, 6 composti da 20 parti (>100 colonne), 160 multivalore. */
  function entity(k: number): Entity {
    const pkName = long(`K${k}_`, 0);
    const attributes: Attribute[] = [{ id: `e${k}a0`, name: pkName, card: '1,1', angle: 0 }];
    for (let i = 1; i < 7; i++) {
      attributes.push({
        id: `e${k}a${i}`, name: long(`C${k}_`, i), card: '1,1', angle: 0,
        // la prima parte si chiama come la chiave: diventa «<attributo>_<parte>», 161 caratteri
        parts: Array.from({ length: 20 }, (_, j) => ({ id: `e${k}a${i}p${j}`, name: j === 0 ? pkName : `p${j}`, card: '1,1' as const })),
      });
    }
    for (let i = 7; i < 167; i++) attributes.push({ id: `e${k}a${i}`, name: long(`M${k}_`, i), card: '0,N', angle: 0 });
    return {
      id: `e${k}`, name: long(`Entita${k}_`, k), pos: { x: 0, y: 0 }, attributes,
      primary: { attributeIds: [`e${k}a0`], externalVia: [] }, alternates: [],
    };
  }

  it('resta un file valido dopo serializzazione e rilettura', () => {
    const d: Diagram = {
      version: 1, id: 'big', title: 'Limiti', relationships: [], generalizations: [],
      entities: [0, 1].map(entity), // 2 tabelle + 320 dei multivalore: oltre il vecchio limite di 300
    };
    expect(parseDiagramFile(serializeDiagram(d)).ok).toBe(true);
    const logical = generateLogical(d);
    expect(logical.tables.length).toBeGreaterThan(300);
    expect(Math.max(...logical.tables.map((t) => t.columns.length))).toBeGreaterThan(100);
    expect(Math.max(...logical.tables.flatMap((t) => [t.name.length, ...t.columns.map((c) => c.name.length)]))).toBeGreaterThan(160);
    const r = parseDiagramFile(serializeDiagram({ ...d, logical }));
    if (!r.ok) throw new Error(r.error);
    expect(r.diagram.logical!.tables).toHaveLength(logical.tables.length);
  });
});
