/** Fornito dal preload di Electron; nel browser non esiste. */
interface RomboBridge {
  readonly desktop: true;
  readonly platform: string;
}

declare global {
  interface Window {
    rombo?: RomboBridge;
  }
}

/** true quando l'app gira dentro il guscio desktop: niente account, niente server. */
export const isDesktop = typeof window !== 'undefined' && window.rombo?.desktop === true;
