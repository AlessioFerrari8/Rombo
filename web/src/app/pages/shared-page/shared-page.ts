import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PublicDiagram } from '../../core/api';
import { Auth } from '../../core/auth';
import { LocalDiagrams } from '../../core/local-diagrams';
import { Toasts } from '../../core/toasts';
import { newId } from '../../domain/ids';
import { Diagram } from '../../domain/model';
import { diagramSchema } from '../../domain/serialize';
import { Canvas } from '../../editor/canvas/canvas';
import { EditorStore } from '../../editor/editor-store';
import { SidePanel } from '../../editor/side-panel/side-panel';

@Component({
  selector: 'app-shared-page',
  templateUrl: './shared-page.html',
  imports: [Canvas, SidePanel, RouterLink],
  providers: [EditorStore],
})
export class SharedPage {
  readonly token = input.required<string>();
  protected readonly store = inject(EditorStore);
  private readonly local = inject(LocalDiagrams);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  protected readonly shared = httpResource<PublicDiagram>(() => `/api/public/${encodeURIComponent(this.token())}`);
  protected readonly diagram = computed<Diagram | null>(() => {
    const v = this.shared.hasValue() ? this.shared.value() : null;
    if (!v) return null;
    const parsed = diagramSchema.safeParse(v.content);
    return parsed.success ? { ...(parsed.data as Diagram), title: v.title } : null;
  });
  protected readonly errorText = computed(() => {
    const e = this.shared.error();
    if (!e) return null;
    return e instanceof HttpErrorResponse && e.status === 404 ? 'Link non valido o revocato.' : 'Non riesco a caricare il diagramma: sei offline?';
  });

  constructor() {
    effect(() => {
      const d = this.diagram();
      if (d) this.store.load(d, { readonly: true });
    });
  }

  async duplicate(): Promise<void> {
    const d = this.diagram();
    if (!d) return;
    const copy: Diagram = { ...structuredClone(d), id: newId(), title: `${d.title} (copia)`.slice(0, 120) };
    await this.local.saveDraft(copy, { uploadable: !!this.auth.user() });
    this.toasts.show('success', 'Copia creata nei tuoi diagrammi.');
    await this.router.navigate(['/d', copy.id]);
  }
}
