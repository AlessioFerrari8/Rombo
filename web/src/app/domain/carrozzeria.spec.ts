import { toDDL } from './ddl';
import { buildCarrozzeria } from './fixtures/carrozzeria';
import { formatLogical, toLogical } from './logical';
import { validate } from './validate';

describe('Gestione Carrozzeria', () => {
  const d = buildCarrozzeria();

  it('non ha problemi', () => {
    expect(validate(d)).toEqual([]);
  });

  it('dà lo schema logico del libro', () => {
    expect(formatLogical(toLogical(d)).split('\n').slice(0, 5)).toEqual([
      'PROPRIETARIO(_CF_, Nome, Cognome, Telefono*)',
      'AUTO(_Targa_, Modello, Marca, Anno, CF_Proprietario→PROPRIETARIO)',
      'DIPENDENTE(_Matricola_, Nome, Cognome)',
      'INTERVENTO(_Codice_, Data, Descrizione, Costo, Targa_Auto→AUTO)',
      'FA(_Matricola_Dipendente_→DIPENDENTE, _Codice_Intervento_→INTERVENTO, Ore)',
    ]);
  });

  it('genera il DDL golden per Postgres e MySQL', async () => {
    const logical = toLogical(d);
    await expect(toDDL(logical, 'postgres')).toMatchFileSnapshot('./fixtures/carrozzeria.postgres.sql');
    await expect(toDDL(logical, 'mysql')).toMatchFileSnapshot('./fixtures/carrozzeria.mysql.sql');
  });
});
