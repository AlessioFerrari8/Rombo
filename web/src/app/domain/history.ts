import { Diagram } from './model';

export const HISTORY_LIMIT = 200;

export interface History {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
}

export function initHistory(d: Diagram): History {
  return { past: [], present: d, future: [] };
}

export function commit(h: History, next: Diagram): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

/** Durante un trascinamento: cambia il presente senza scrivere nello storico. */
export function preview(h: History, next: Diagram): History {
  return { ...h, present: next };
}

/** Fine del trascinamento: registra un solo passo, dallo stato di partenza. */
export function commitPreview(h: History, base: Diagram): History {
  if (h.present === base) return h;
  return { past: [...h.past, base].slice(-HISTORY_LIMIT), present: h.present, future: [] };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = (h: History): boolean => h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;
