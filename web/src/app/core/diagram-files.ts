import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { createDiagram } from '../domain/commands';
import { parseDiagramFile } from '../domain/serialize';
import { Auth } from './auth';
import { slugify } from './download';
import { LocalDiagrams } from './local-diagrams';
import { Toasts } from './toasts';

export const MAX_DIAGRAM_FILE = 2_000_000;
/** Estensioni che "Apri file" accetta: .rombo e' lo stesso JSON di .json / .er.json. */
export const DIAGRAM_FILE_ACCEPT = '.rombo,.json,application/json';

export function diagramFileName(title: string): string {
  return `${slugify(title)}.rombo`;
}

/** Messaggio per un file che il guscio desktop non e' riuscito a leggere. */
export function openFailureMessage(name: string, reason: string): string {
  switch (reason) {
    case 'too-big': return 'Il file è troppo grande (massimo 2 MB).';
    case 'extension': return `«${name}» non è un diagramma: servono file .rombo o .json.`;
    default: return `Impossibile leggere «${name}».`;
  }
}

/** Creazione e import dei diagrammi, condivisi fra la home e il menu File del desktop. */
@Injectable({ providedIn: 'root' })
export class DiagramFiles {
  private readonly local = inject(LocalDiagrams);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  async create(): Promise<void> {
    const d = createDiagram();
    await this.local.saveDraft(d, { uploadable: !!this.auth.user() });
    await this.router.navigate(['/d', d.id]);
  }

  /** Importa il testo di un file e apre l'editor; false (con toast) se non e' un diagramma. */
  async importText(text: string): Promise<boolean> {
    if (text.length > MAX_DIAGRAM_FILE) {
      this.toasts.show('error', 'Il file è troppo grande (massimo 2 MB).');
      return false;
    }
    const r = parseDiagramFile(text);
    if (!r.ok) {
      this.toasts.show('error', r.error, 8000);
      return false;
    }
    await this.local.saveDraft(r.diagram, { uploadable: !!this.auth.user() });
    for (const w of r.warnings) this.toasts.show('warning', w, 10000);
    if (r.source === 'erdrawer') this.toasts.show('info', 'Importato da erdrawer: controlla il pannello Problemi.', 8000);
    await this.router.navigate(['/d', r.diagram.id]);
    return true;
  }
}
