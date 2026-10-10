import {
  addAttribute, addEntity, addRelationship, createDiagram, toggleIdentifierAttribute, updateAttribute, updateParticipant,
} from '../commands';
import { AttrCard, Diagram, Id } from '../model';

/** L'esercizio di 4ª del 23/09, ricostruito dagli screenshot di erdrawer. */
export function buildCarrozzeria(): Diagram {
  let d = createDiagram('Gestione Carrozzeria');
  const ent = (name: string, x: number, y: number): Id => {
    const r = addEntity(d, { x, y }, name);
    d = r.diagram;
    return r.id;
  };
  const attr = (owner: Id, name: string, type?: string, card: AttrCard = '1,1'): Id => {
    const r = addAttribute(d, owner, name, card);
    d = r.diagram;
    if (type) d = updateAttribute(d, r.id, { type });
    return r.id;
  };
  const key = (owner: Id, attrId: Id) => {
    d = toggleIdentifierAttribute(d, owner, attrId);
  };
  const rel = (name: string, a: Id, b: Id, ca: [0 | 1, 1 | 'N'], cb: [0 | 1, 1 | 'N']): Id => {
    const r = addRelationship(d, [a, b], undefined, name);
    d = r.diagram;
    d = updateParticipant(d, r.id, 0, { min: ca[0], max: ca[1] });
    d = updateParticipant(d, r.id, 1, { min: cb[0], max: cb[1] });
    return r.id;
  };

  const proprietario = ent('Proprietario', 120, 120);
  key(proprietario, attr(proprietario, 'CF', 'CHAR(16)'));
  attr(proprietario, 'Nome');
  attr(proprietario, 'Cognome');
  attr(proprietario, 'Telefono', 'VARCHAR(20)', '0,1');

  const auto = ent('Auto', 560, 120);
  key(auto, attr(auto, 'Targa', 'VARCHAR(10)'));
  attr(auto, 'Modello');
  attr(auto, 'Marca');
  attr(auto, 'Anno', 'INT');

  const dipendente = ent('Dipendente', 120, 460);
  key(dipendente, attr(dipendente, 'Matricola', 'INT'));
  attr(dipendente, 'Nome');
  attr(dipendente, 'Cognome');

  const intervento = ent('Intervento', 560, 460);
  key(intervento, attr(intervento, 'Codice', 'INT'));
  attr(intervento, 'Data', 'DATE');
  attr(intervento, 'Descrizione', 'TEXT');
  attr(intervento, 'Costo', 'DECIMAL(8,2)');

  rel('possiede', proprietario, auto, [1, 'N'], [1, 1]);
  rel('subisce', auto, intervento, [0, 'N'], [1, 1]);
  const fa = rel('fa', dipendente, intervento, [0, 'N'], [1, 'N']);
  attr(fa, 'Ore', 'INT');
  return d;
}
