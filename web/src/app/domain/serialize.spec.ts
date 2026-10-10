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
