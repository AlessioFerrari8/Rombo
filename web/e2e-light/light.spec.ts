import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const fixture = path.join(__dirname, 'fixtures', 'con-logico.json');

test('Rombo Light: niente modo Logico, schema logico, SQL né tipi delle colonne', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Rombo Light/);
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByRole('application', { name: 'Diagramma entità-relazione' })).toBeVisible();
  await expect(page).toHaveTitle('Rombo Light');

  await expect(page.getByRole('button', { name: 'Logico' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Tipo di diagramma' })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveText(['Proprietà', /Problemi/]);
  await page.getByRole('button', { name: 'Esporta' }).click();
  await expect(page.locator('.ui-menu-item')).toHaveText(['Immagine PNG', 'Immagine SVG', /File diagramma/]);
  await page.keyboard.press('Escape');

  await page.locator('[data-entity="Auto"]').click();
  await expect(page.getByLabel("Nome dell'entità")).toHaveValue('Auto');
  await expect(page.getByLabel('Tipo SQL')).toHaveCount(0);
  expect(await page.content()).not.toMatch(/Schema logico|CREATE TABLE|SQL MySQL/);
});

test('Rombo Light: disegno, validazione, export PNG, salvataggio e riapertura (lo schema logico del file resta)', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  const canvas = page.getByRole('application', { name: 'Diagramma entità-relazione' });
  await expect(canvas).toBeVisible();

  // nuova entità senza chiave: errore nella validazione ER
  await page.keyboard.press('e');
  await canvas.click({ position: { x: 700, y: 600 } });
  await page.getByLabel('Nome', { exact: true }).fill('Garage');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nome', { exact: true })).toBeHidden();
  await expect(page.getByRole('tab', { name: /Problemi/ })).toContainText('1');
  await page.getByRole('tab', { name: /Problemi/ }).click();
  await expect(page.getByText('«Garage» non ha un identificatore')).toBeVisible();

  // la corregge: un attributo nell'identificatore
  await page.locator('[data-entity="Garage"]').click();
  await page.keyboard.press('a');
  await page.getByRole('tab', { name: 'Proprietà' }).click();
  await expect(page.getByLabel("Nome dell'attributo").first()).toHaveValue('attributo');
  await page.getByLabel("Nome dell'attributo").first().fill('Codice');
  await page.getByLabel("Nome dell'attributo").first().press('Tab');
  await page.locator('[data-attr="Codice"] .er-dot').click();
  // nessun errore: resta solo l'avviso «non è collegata a niente»
  await expect(page.locator('[role=tab] .ui-badge-error')).toHaveCount(0);
  await page.getByRole('tab', { name: /Problemi/ }).click();
  await expect(page.getByText('«Garage» non ha un identificatore')).toHaveCount(0);
  await expect(page.getByText('«Garage» non è collegata a niente.')).toBeVisible();

  await page.getByRole('button', { name: 'Esporta' }).click();
  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Immagine PNG' }).click();
  expect((await png).suggestedFilename()).toMatch(/\.png$/);

  await page.getByRole('button', { name: 'Esporta' }).click();
  const json = page.waitForEvent('download');
  await page.getByRole('button', { name: /File diagramma/ }).click();
  const file = (await (await json).path())!;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.entities.map((e: { name: string }) => e.name)).toContain('Garage');
  // Light non tocca lo schema logico fatto con la versione completa: resta nel file
  expect(saved.logical.tables.map((t: { name: string }) => t.name)).toEqual(['Proprietario', 'Auto']);

  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(file);
  // anche le anteprime della home hanno [data-entity]: si guarda dentro l'editor
  const reopened = page.getByRole('application', { name: 'Diagramma entità-relazione' });
  await expect(reopened).toBeVisible();
  await expect(reopened.locator('[data-entity="Garage"]')).toBeVisible();
  await expect(reopened.locator('[data-entity="Auto"]')).toBeVisible();
});
