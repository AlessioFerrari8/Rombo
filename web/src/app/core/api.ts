import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Diagram } from '../domain/model';

export interface Me { id: string; email: string }
export interface DiagramSummary { id: string; title: string; version: number; updatedAt: string }
export interface DiagramFull extends DiagramSummary { content: unknown }
export interface PublicDiagram { title: string; content: unknown; updatedAt: string }

export function apiError(e: unknown, fallback: string): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Server non raggiungibile: sei offline?';
    const msg = (e.error as { error?: string } | null)?.error;
    if (msg) return msg;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  csrf() { return firstValueFrom(this.http.get<{ token: string }>('/api/auth/csrf')); }
  register(email: string, password: string) { return firstValueFrom(this.http.post<Me>('/api/auth/register', { email, password })); }
  login(email: string, password: string) { return firstValueFrom(this.http.post<Me>('/api/auth/login', { email, password })); }
  logout() { return firstValueFrom(this.http.post<void>('/api/auth/logout', {})); }
  me() { return firstValueFrom(this.http.get<Me>('/api/auth/me')); }
  deleteMe() { return firstValueFrom(this.http.delete<void>('/api/auth/me')); }

  listDiagrams() { return firstValueFrom(this.http.get<DiagramSummary[]>('/api/diagrams')); }
  getDiagram(id: string) { return firstValueFrom(this.http.get<DiagramFull>(`/api/diagrams/${id}`)); }
  createDiagram(d: Diagram) {
    return firstValueFrom(this.http.post<DiagramFull>('/api/diagrams', { id: d.id, title: d.title, content: d }));
  }
  updateDiagram(d: Diagram, version: number) {
    return firstValueFrom(this.http.put<DiagramFull>(`/api/diagrams/${d.id}`, { title: d.title, content: d, version }));
  }
  deleteDiagram(id: string) { return firstValueFrom(this.http.delete<void>(`/api/diagrams/${id}`)); }

  getShare(id: string) { return firstValueFrom(this.http.get<{ token: string }>(`/api/diagrams/${id}/share`)); }
  createShare(id: string) { return firstValueFrom(this.http.post<{ token: string }>(`/api/diagrams/${id}/share`, {})); }
  revokeShare(id: string) { return firstValueFrom(this.http.delete<void>(`/api/diagrams/${id}/share`)); }
}
