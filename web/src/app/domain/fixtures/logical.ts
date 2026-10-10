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
