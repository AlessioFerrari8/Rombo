/** Esito della lettura di un file fatta dal main (doppio clic, "Apri con", menu File → Apri). */
export type DesktopOpenedFile =
  | { ok: true; name: string; text: string }
  | { ok: false; name: string; reason: string };

export type DesktopMenuCommand = 'new' | 'save-as';

export type DesktopSaveResult = { ok: true; name: string } | { ok: false; reason: string };

/** Fornito dal preload di Electron; nel browser non esiste. */
export interface RomboBridge {
  readonly desktop: true;
  readonly platform: string;
  onOpenFile(cb: (file: DesktopOpenedFile) => void): void;
  onMenu(cb: (command: DesktopMenuCommand) => void): void;
  saveFile(name: string, text: string): Promise<DesktopSaveResult>;
}

declare global {
  interface Window {
    rombo?: RomboBridge;
  }
}

/** true quando l'app gira dentro il guscio desktop: niente account, niente server. */
export const isDesktop = typeof window !== 'undefined' && window.rombo?.desktop === true;

/** Il ponte completo, oppure null (browser, o un preload vecchio senza le funzioni file). */
export function desktopBridge(w: Partial<Window> | undefined = typeof window === 'undefined' ? undefined : window): RomboBridge | null {
  const b = w?.rombo;
  if (!b || b.desktop !== true) return null;
  const fns = [b.onOpenFile, b.onMenu, b.saveFile];
  return fns.every((f) => typeof f === 'function') ? b : null;
}
