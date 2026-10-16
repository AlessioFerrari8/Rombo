import { InjectionToken } from '@angular/core';
import { EDITION } from './edition';
import { Edition } from './edition-types';

/** L'edizione via DI: i test possono provare l'interfaccia Light senza ricompilare. */
export const EDITION_CONFIG = new InjectionToken<Edition>('rombo-edition', { providedIn: 'root', factory: () => EDITION });
