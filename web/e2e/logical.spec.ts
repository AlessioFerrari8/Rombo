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
  await page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();
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
    // le scorciatoie non scattano mentre il fuoco e' in un campo del pannello: prima si torna al foglio
    await canvas.click({ position: { x: 20, y: 20 } });
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
  await expect(page.locator('[data-table="Ordine"]')).toContainText('cliente_id→CLIENTE');

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
