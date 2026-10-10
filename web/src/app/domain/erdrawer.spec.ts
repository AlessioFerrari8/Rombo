import { ErdrawerProject, fromErdrawer, isErdrawer, parseErCard } from './erdrawer';

const project: ErdrawerProject = {
  version: 1,
  entities: [
    {
      uuid: 'e-prop', name: 'Proprietario', x: 100, y: 100, width: 120, height: 60, composedKey: false,
      attributes: [{ uuid: 'a-cf', name: 'CF', isPrimaryKey: true, circleX: 160, circleY: 60 }],
    },
    {
      uuid: 'e-auto', name: 'Auto', x: 400, y: 100, width: 120, height: 60, composedKey: true,
      attributes: [
        { uuid: 'a-targa', name: 'Targa', isPrimaryKey: true, circleX: 460, circleY: 60 },
        { uuid: 'a-naz', name: 'Nazione', isPrimaryKey: true, circleX: 560, circleY: 130 },
        { uuid: 'a-mod', name: 'Modello', isPrimaryKey: false, circleX: 460, circleY: 200 },
      ],
    },
    { uuid: 'e-dip', name: 'Dipendente', x: 100, y: 400, width: 120, height: 60, attributes: [] },
    { uuid: 'e-mec', name: 'Meccanico', x: 100, y: 600, width: 120, height: 60, attributes: [] },
  ],
  relationships: [
    {
      uuid: 'r-poss', name: 'possiede', rhombusX: 300, rhombusY: 130, entityUUIDs: ['e-prop', 'e-auto'],
      cardinals: ['1, n', 'boh'], attributes: [{ uuid: 'a-dal', name: 'Dal', isPrimaryKey: false, circleX: 300, circleY: 80 }],
    },
    { uuid: 'r-rotta', name: 'orfana', rhombusX: 0, rhombusY: 0, entityUUIDs: ['e-dip', 'e-sparita'], cardinals: ['0,1', '1,1'] },
  ],
  isaRelations: [
    { parentUUID: 'e-dip', childrenUUIDs: ['e-mec'], label: '(T, E)' },
    { parentUUID: 'e-dip', childrenUUIDs: ['e-sparita'], label: '(P, O)' },
  ],
};

describe('parseErCard', () => {
  it('capisce le scritture che si vedono in giro', () => {
    expect(parseErCard('1,N')).toEqual({ min: 1, max: 'N' });
    expect(parseErCard('0, n')).toEqual({ min: 0, max: 'N' });
    expect(parseErCard('1,25')).toEqual({ min: 1, max: 25 });
    expect(parseErCard('(0,3)')).toEqual({ min: 0, max: 3 });
    expect(parseErCard('(1,1)')).toEqual({ min: 1, max: 1 });
    expect(parseErCard('0 1')).toEqual({ min: 0, max: 1 });
  });
  it('quello che non capisce lo lascia vuoto (poi lo segnala la validazione)', () => {
    expect(parseErCard('boh')).toEqual({ min: null, max: null });
    expect(parseErCard(undefined)).toEqual({ min: null, max: null });
  });
});

describe('fromErdrawer', () => {
  const { diagram: d, warnings } = fromErdrawer(project);
  const byName = (n: string) => d.entities.find((e) => e.name === n)!;

  it('riconosce il formato', () => {
    expect(isErdrawer(project)).toBe(true);
    expect(isErdrawer({ version: 1, entities: [], relationships: [], generalizations: [] })).toBe(false);
  });

  it("porta le posizioni al centro e l'angolo degli attributi", () => {
    expect(byName('Proprietario').pos).toEqual({ x: 160, y: 130 });
    expect(byName('Proprietario').attributes[0].angle).toBeCloseTo(-Math.PI / 2);
  });

  it("le chiavi diventano l'identificatore (composto se erano piu di una)", () => {
    const auto = byName('Auto');
    expect(auto.primary!.attributeIds).toEqual([auto.attributes[0].id, auto.attributes[1].id]);
  });

  it('mantiene cardinalita e attributi delle associazioni, anche quelle illeggibili', () => {
    const r = d.relationships.find((x) => x.name === 'possiede')!;
    expect(r.participants.map((p) => [p.min, p.max])).toEqual([[1, 'N'], [null, null]]);
    expect(r.attributes.map((a) => a.name)).toEqual(['Dal']);
  });

  it("non scarta in silenzio l'associazione verso un'entita sparita", () => {
    const r = d.relationships.find((x) => x.name === 'orfana')!;
    expect(r.participants).toHaveLength(1);
    expect(warnings).toContain('«orfana» puntava a entità che non ci sono più: controlla i suoi collegamenti.');
  });

  it('legge la IS-A e avvisa di quella senza figli', () => {
    expect(d.generalizations).toHaveLength(1);
    expect(d.generalizations[0]).toMatchObject({ total: true, exclusive: true });
    expect(warnings).toContain('Una gerarchia IS-A senza padre o figli è stata saltata.');
  });
});
