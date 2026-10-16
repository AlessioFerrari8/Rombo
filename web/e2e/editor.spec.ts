import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import path from 'node:path';

const fixture = path.join(__dirname, 'fixtures', 'erdrawer-carrozzeria.json');

test('disegna, sbaglia, corregge e ottiene lo schema logico', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuovo diagramma' }).first().click();
  await expect(page).toHaveURL(/\/d\//);

  const canvas = page.getByRole('application', { name: 'Diagramma entità-relazione' });
  // il canvas esiste solo dopo il caricamento da IndexedDB: prima i tasti vanno persi
  await expect(canvas).toBeVisible();
  await page.keyboard.press('e');
  await canvas.click({ position: { x: 300, y: 300 } });
  await page.getByLabel('Nome', { exact: true }).fill('Proprietario');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nome', { exact: true })).toBeHidden();
  await page.keyboard.press('e');
  await canvas.click({ position: { x: 700, y: 300 } });
  await page.getByLabel('Nome', { exact: true }).fill('Auto');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nome', { exact: true })).toBeHidden();

  // due entità senza chiave: due errori
  await expect(page.getByRole('tab', { name: /Problemi/ })).toContainText('2');

  for (const [entity, attr] of [['Proprietario', 'CF'], ['Auto', 'Targa']]) {
    await page.locator(`[data-entity="${entity}"]`).click();
    await page.keyboard.press('a');
    // il pannello si ridisegna al frame dopo: prima mostra ancora l'attributo di prima
    await expect(page.getByLabel("Nome dell'attributo").first()).toHaveValue('attributo');
    await page.getByLabel("Nome dell'attributo").first().fill(attr);
    await page.getByLabel("Nome dell'attributo").first().press('Tab'); // il blur fa scattare (change)
    await page.locator(`[data-attr="${attr}"] .er-dot`).click();
  }

  await page.locator('[data-entity="Proprietario"]').click();
  await page.locator('[data-entity="Auto"]').click({ modifiers: ['Shift'] });
  await page.keyboard.press('r');
  const mins = page.getByLabel('Minimo');
  const maxs = page.getByLabel('Massimo');
  await mins.nth(0).selectOption('1');
  await maxs.nth(0).selectOption('N');
  await mins.nth(1).selectOption('1');
  await maxs.nth(1).selectOption('1');

  await page.getByRole('tab', { name: 'Schema logico' }).click();
  await expect(page.locator('[data-table="Auto"]')).toContainText('CF_Proprietario→PROPRIETARIO');

  // annulla l'ultima cardinalità: torna un errore
  await canvas.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  await page.getByRole('tab', { name: /Problemi/ }).click();
  await expect(page.getByText(/Manca la cardinalità di «Auto»/)).toBeVisible();
});

test('i costrutti del modello concettuale: unaria con ruoli, attributo composto, molteplicità (1,25)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nuovo diagramma' }).first().click();
  await expect(page).toHaveURL(/\/d\//);
  const canvas = page.getByRole('application', { name: 'Diagramma entità-relazione' });
  await expect(canvas).toBeVisible();
  const nameIn = page.getByLabel('Nome', { exact: true });
  const attrName = page.getByLabel("Nome dell'attributo").first();
  for (const [n, x] of [['Persona', 250], ['Classe', 750]] as const) {
    await page.keyboard.press('e');
    await canvas.click({ position: { x, y: 300 } });
    await nameIn.fill(n);
    await page.keyboard.press('Enter');
    await expect(nameIn).toBeHidden();
    await page.locator(`[data-entity="${n}"]`).click();
    await page.keyboard.press('a');
    await expect(attrName).toHaveValue('attributo');
    await attrName.fill(n === 'Persona' ? 'CF' : 'sezione');
    await attrName.press('Tab');
    await page.locator(`[data-attr="${n === 'Persona' ? 'CF' : 'sezione'}"] .er-dot`).click();
  }

  // unaria: R con una sola entità selezionata, poi i ruoli
  await page.locator('[data-entity="Persona"]').click();
  await page.keyboard.press('r');
  await page.getByLabel("Nome dell'associazione").fill('genitore');
  await page.getByLabel("Nome dell'associazione").press('Tab');
  await page.getByLabel('Minimo').nth(0).selectOption('0');
  await page.getByLabel('Massimo').nth(0).selectOption('N');
  await page.getByLabel('Minimo').nth(1).selectOption('1');
  await page.getByLabel('Massimo').nth(1).selectOption('1');
  await page.getByLabel('Ruolo').nth(0).fill('genitore di');
  await page.getByLabel('Ruolo').nth(0).press('Tab');
  await page.getByLabel('Ruolo').nth(1).fill('figlio di');
  await page.getByLabel('Ruolo').nth(1).press('Tab');
  await expect(page.locator('[data-rel="genitore"]')).toBeVisible();

  // attributo composto: A su un attributo aggiunge una parte
  await page.locator('[data-entity="Persona"]').click();
  await page.keyboard.press('a');
  await expect(attrName).toHaveValue('attributo');
  await attrName.fill('indirizzo');
  await attrName.press('Tab');
  for (const part of ['via', 'CAP']) {
    await page.locator('[data-attr="indirizzo"] text, [data-composite="indirizzo"] text').first().click();
    await page.keyboard.press('a');
    const partName = page.getByLabel('Nome della parte').first();
    await expect(partName).toHaveValue(/^parte/);
    await partName.fill(part);
    await partName.press('Tab');
  }
  await expect(page.locator('[data-composite="indirizzo"] ellipse')).toBeVisible();

  // molteplicità numerica
  await page.locator('[data-entity="Persona"]').click();
  await page.locator('[data-entity="Classe"]').click({ modifiers: ['Shift'] });
  await page.keyboard.press('r');
  await page.getByLabel("Nome dell'associazione").fill('frequenta');
  await page.getByLabel("Nome dell'associazione").press('Tab');
  await page.getByLabel('Minimo').nth(0).selectOption('1');
  await page.getByLabel('Massimo').nth(0).selectOption('1');
  await page.getByLabel('Minimo').nth(1).selectOption('1');
  await page.getByLabel('Massimo').nth(1).selectOption('num');
  await page.getByLabel('Massimo (numero)').fill('25');
  await page.getByLabel('Massimo (numero)').press('Tab');
  await expect(page.locator('text.er-card', { hasText: '(1,25)' })).toBeVisible();

  await page.getByRole('tab', { name: 'Schema logico' }).click();
  await expect(page.locator('[data-table="Persona"]')).toContainText('via');
  await expect(page.locator('[data-table="Persona"]')).toContainText('CAP');
  await expect(page.locator('[data-table="Persona"]')).toContainText('Classe');
});

test('importa il file di erdrawer e mostra gli errori che erdrawer non diceva', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page).toHaveURL(/\/d\//);
  await page.getByRole('tab', { name: /Problemi/ }).click();
  await expect(page.getByText('«Dipendente» non ha un identificatore: clicca il pallino di un attributo per sceglierlo.')).toBeVisible();
  await expect(page.getByText('Manca la cardinalità di «Intervento» in «fa»: sceglila nel pannello Proprietà.')).toBeVisible();
  await page.getByText('«Dipendente» non ha un identificatore').click();
  await expect(page.locator('[data-entity="Dipendente"] .er-selected')).toBeVisible();
});

test("esporta un PNG e un .er.json che si riapre", async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Esporta' }).click();
  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Immagine PNG' }).click();
  expect((await png).suggestedFilename()).toMatch(/\.png$/);

  await page.getByRole('button', { name: 'Esporta' }).click();
  const json = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File diagramma (.er.json)' }).click();
  const file = await (await json).path();
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(file!);
  await expect(page.locator('[data-entity="Intervento"]')).toBeVisible();
});

test('layout automatico e undo', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  // anche le anteprime della home hanno [data-entity]: prima si aspetta l'editor
  await expect(page).toHaveURL(/\/d\//);
  await expect(page.getByRole('application', { name: 'Diagramma entità-relazione' })).toBeVisible();
  const before = await page.locator('[data-entity="Auto"] rect.er-entity-shape').getAttribute('x');
  await page.keyboard.press('l');
  await expect.poll(async () => page.locator('[data-entity="Auto"] rect.er-entity-shape').getAttribute('x')).not.toBe(before);
  // durante l'animazione del layout l'undo e' bloccato (Task 16): si aspetta che torni disponibile
  await expect(page.getByRole('button', { name: 'Annulla' })).toBeEnabled();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => page.locator('[data-entity="Auto"] rect.er-entity-shape').getAttribute('x')).toBe(before);
});

for (const theme of ['quaderno', 'lavagna'] as const) {
  test(`contrasto e accessibilità nel tema ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('diagrammier.theme', t), theme);
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(fixture);
    await expect(page.locator('[data-entity="Auto"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('sotto i 1024 px si guarda soltanto', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByText(/si può solo guardare/)).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-entity="Auto"]')).toBeVisible();
});

test("entità debole: l'identificante resta 1:N, senza errori, con chiave composta nell'SQL", async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'er-semplice.json'));
  await expect(page.getByRole('application', { name: 'Diagramma entità-relazione' })).toBeVisible();
  await page.locator('[data-entity="Auto"]').click();
  await page.getByLabel('Entità debole').check();
  await expect(page.getByLabel('Identificante tramite «possiede»')).toBeChecked();
  await expect(page.locator('[data-rel="possiede"] .er-kind')).toHaveText('1:N');
  await expect(page.locator('[data-rel="possiede"] .er-rel-weak')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: /Problemi/ })).not.toContainText(/\d/);
  await page.getByRole('tab', { name: 'SQL' }).click();
  await expect(page.locator('pre code')).toContainText('PRIMARY KEY ("Targa", "CF_Proprietario")');
});

test('le linee rombo-entità sono segmenti dritti, anche dopo il layout automatico', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByRole('application', { name: 'Diagramma entità-relazione' })).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Annulla' })).toBeEnabled();
  const lines = await page.locator('polyline[data-link]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('points')!.trim().split(/\s+/).map((p) => p.split(',').map(Number))));
  expect(lines.length).toBeGreaterThan(0);
  for (const pts of lines) {
    expect(pts).toHaveLength(2);
    const [[x1, y1], [x2, y2]] = pts;
    // o perfettamente verticale/orizzontale, o una diagonale vera (non «quasi dritta»)
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    expect(dx === 0 || dy === 0 || Math.min(dx, dy) > 20).toBe(true);
  }
});
