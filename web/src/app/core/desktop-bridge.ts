import { Injectable, inject } from '@angular/core';
import { Diagram } from '../domain/model';
import { serializeDiagram } from '../domain/serialize';
import { DiagramFiles, diagramFileName, openFailureMessage } from './diagram-files';
import { DesktopMenuCommand, DesktopOpenedFile, RomboBridge, desktopBridge } from './platform';
import { Toasts } from './toasts';

/** Collega menu File e file aperti dal sistema all'app. Nel browser non fa niente. */
@Injectable({ providedIn: 'root' })
export class DesktopBridge {
  private readonly files = inject(DiagramFiles);
  private readonly toasts = inject(Toasts);
  private bridge: RomboBridge | null = null;
  private current: (() => Diagram) | null = null;
  // i file arrivano uno alla volta: in coda, cosi' l'ultimo resta aperto
  private queue: Promise<unknown> = Promise.resolve();

  get available(): boolean {
    return this.bridge !== null;
  }

  init(bridge: RomboBridge | null = desktopBridge()): void {
    if (this.bridge || !bridge) return;
    this.bridge = bridge;
    // prima il menu: onOpenFile segnala al main che la pagina e' pronta
    bridge.onMenu((cmd) => void this.onMenu(cmd));
    bridge.onOpenFile((file) => {
      this.queue = this.queue.then(() => this.onOpenFile(file)).catch(() => undefined);
    });
  }

  /** L'editor dice quale diagramma salverebbe "Salva con nome"; null quando si chiude. */
  setCurrent(getter: (() => Diagram) | null): void {
    this.current = getter;
  }

  async saveAs(diagram: Diagram): Promise<void> {
    if (!this.bridge) return;
    try {
      const r = await this.bridge.saveFile(diagramFileName(diagram.title), serializeDiagram(diagram));
      if (r.ok) this.toasts.show('success', `Salvato «${r.name}».`);
      // annullato, o un dialog e' gia' aperto: niente da dire
      else if (r.reason !== 'canceled' && r.reason !== 'busy') this.toasts.show('error', 'Salvataggio non riuscito.');
    } catch {
      this.toasts.show('error', 'Salvataggio non riuscito.');
    }
  }

  private async onMenu(cmd: DesktopMenuCommand): Promise<void> {
    if (cmd === 'new') return this.files.create();
    const d = this.current?.();
    if (d) return this.saveAs(d);
    this.toasts.show('info', 'Apri un diagramma per salvarlo con nome.');
  }

  private async onOpenFile(file: DesktopOpenedFile): Promise<void> {
    if (!file.ok) {
      this.toasts.show('error', openFailureMessage(file.name, file.reason), 8000);
      return;
    }
    await this.files.importText(file.text);
  }
}
