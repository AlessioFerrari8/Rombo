import { EDITION_CONFIG } from '../../edition/edition-token';
import { AccountMenu } from '../../shared/account-menu/account-menu';
import { isDesktop } from '../../core/platform';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../../core/theme';
import { DesktopBridge } from '../../core/desktop-bridge';
import { downloadBlob, slugify } from '../../core/download';
import { Sync } from '../../core/sync';
import { Toasts } from '../../core/toasts';
import { setTitle } from '../../domain/commands';
import { sceneExportBounds } from '../../domain/scene';
import { logicalBounds } from '../../edition/logical-domain';
import { LogicalExportItems, ModeSwitch } from '../../edition/logical-ui';
import { serializeDiagram } from '../../domain/serialize';
import { EditorStore } from '../editor-store';
import { ShareDialog } from '../share-dialog/share-dialog';
import { exportSvgString, svgToPng } from '../exporter';

@Component({ selector: 'app-top-bar', templateUrl: './top-bar.html', imports: [RouterLink, AccountMenu, ShareDialog, ModeSwitch, LogicalExportItems] })
export class TopBar {
  protected readonly editionName = inject(EDITION_CONFIG).name;
  protected readonly desktop = isDesktop;
  protected readonly store = inject(EditorStore);
  protected readonly theme = inject(ThemeService);
  protected readonly sync = inject(Sync);
  private readonly toasts = inject(Toasts);
  private readonly bridge = inject(DesktopBridge);
  /** Sul desktop il file diagramma e' un .rombo salvato col dialog nativo. */
  protected readonly nativeSave = this.bridge.available;
  protected readonly exporting = signal(false);

  rename(value: string): void {
    if (value.trim() && value.trim() !== this.store.diagram().title) this.store.apply((d) => setTitle(d, value));
  }

  private base(): string {
    return slugify(this.store.diagram().title);
  }

  /** Il menu (.ui-dropdown) resta aperto finche' il focus e' dentro: scelta una voce, si chiude. */
  closeMenu(ev: Event): void {
    if ((ev.target as HTMLElement).closest('button')) (document.activeElement as HTMLElement | null)?.blur();
  }

  async exportImage(kind: 'png' | 'svg'): Promise<void> {
    const svgEl = this.store.canvasSvg?.();
    const d = this.store.diagram();
    const bounds = this.store.mode() === 'logical' ? (d.logical ? logicalBounds(d.logical) : null) : sceneExportBounds(d);
    if (!svgEl || !bounds) {
      this.toasts.show('info', 'Il diagramma è vuoto: non c\'è niente da esportare.');
      return;
    }
    this.exporting.set(true);
    try {
      const svg = await exportSvgString(svgEl, bounds);
      if (kind === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${this.base()}.svg`);
      else downloadBlob(await svgToPng(svg), `${this.base()}.png`);
    } catch {
      this.toasts.show('error', 'Esportazione non riuscita. Riprova, oppure esporta in SVG.');
    } finally {
      this.exporting.set(false);
    }
  }

  exportJson(): void {
    if (this.nativeSave) {
      void this.bridge.saveAs(this.store.diagram());
      return;
    }
    downloadBlob(new Blob([serializeDiagram(this.store.diagram())], { type: 'application/json' }), `${this.base()}.er.json`);
  }
}
