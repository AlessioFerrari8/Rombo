# Rombo

Editor di diagrammi entità-relazione in notazione Chen, con validazione, schema logico e SQL.
Versione **desktop** (Windows, Linux, macOS) di DiagrammiER: gira offline, i diagrammi stanno sul
computer e si scambiano come file `.rombo` (menu File → Salva con nome… / Apri…, oppure doppio clic sul
file). Un `.rombo` è lo stesso JSON di DiagrammiER: si aprono anche i `.json` di DiagrammiER ed erdrawer.
Nessun account, nessun server.

### Schema logico

Accanto al diagramma ER c'è lo **schema logico relazionale**, modificabile a mano: l'interruttore **ER | Logico**
nella barra cambia modo. Dal modo Logico «Genera dall'ER» crea una copia delle tabelle (una sola volta: poi è
indipendente dall'ER, e rigenerare chiede conferma); in alternativa si parte da zero con lo strumento Tabella (T).
Le tabelle si spostano sul foglio, le colonne si modificano dal pannello Proprietà (PK, NULL, UNIQUE, tipo, ordine) e
le chiavi esterne si creano dal pannello o trascinando il pallino di una colonna su un'altra tabella. Lo schema sta
nello stesso file `.rombo`; i pannelli «Schema logico» e «SQL» e il menu Esporta lavorano sullo schema del modo attivo.

## Installare

| Sistema | File |
|---|---|
| Windows | `Rombo-<v>-win-x64.exe` (installer) o `.msi` |
| Linux | `Rombo-<v>-linux-x86_64.AppImage` (`chmod +x`, poi doppio clic) o `.deb` (`sudo apt install ./Rombo-*.deb`) |
| macOS | `Rombo-<v>-mac-arm64.dmg` (Apple Silicon) o `-x64.dmg` (Intel) |

Gli installer **non sono firmati**:
- **Windows**: SmartScreen → «Ulteriori informazioni» → «Esegui comunque».
- **macOS**: clic destro su Rombo → «Apri» la prima volta (oppure `xattr -cr /Applications/Rombo.app`).
- **Linux**: su Ubuntu 24.04+ l'AppImage può non partire per le restrizioni AppArmor: lanciarla con
  `--no-sandbox`, oppure usare il `.deb`.

## Edizione Light

**Rombo Light** è la versione da usare **alla maturità** (o in qualunque verifica): c'è solo l'editor ER in
notazione Chen, con la validazione, il layout automatico, i file `.rombo` e l'esportazione in PNG/SVG. Non ci sono
il modo Logico, i pannelli «Schema logico» e «SQL», l'export dello schema/SQL né i tipi SQL degli attributi: non
sono nascosti, mancano proprio dal programma. Non controlla gli aggiornamenti (nessuna connessione, nessun dialog
a sorpresa durante la prova).

- **Scaricare**: dalle release con tag `light-vX.Y.Z` (titolo «Rombo Light …»), file
  `Rombo-Light-<v>-win-x64.exe` / `.msi`, `Rombo-Light-<v>-linux-x86_64.AppImage` / `.deb`,
  `Rombo-Light-<v>-mac-arm64.dmg` / `-x64.dmg`.
- **Accanto alla completa**: nome, identificativo (`it.alessio.rombo.light`) e cartella dei dati sono suoi, quindi
  si installano tutte e due; i diagrammi salvati dentro l'app restano separati.
- **File compatibili**: un `.rombo` fatto con Light si apre nella completa e viceversa. Se il file contiene uno
  schema logico, Light non lo mostra ma lo conserva quando risalva.
- **Installer non firmati**, come la completa: su Windows SmartScreen → «Ulteriori informazioni» → «Esegui comunque»;
  su macOS clic destro su Rombo Light → «Apri» la prima volta (oppure `xattr -cr "/Applications/Rombo Light.app"`).

## Sviluppo

```bash
npm ci && npm run web:install   # dipendenze (guscio Electron + app Angular in web/)
npm start                       # compila web/ e apre Rombo (npm run dev -- file.rombo apre un file)
npm test                        # test del guscio (node --test); quelli dell'app: npm --prefix web test
npm run dist:linux              # release/ (anche dist:win, dist:mac sui rispettivi sistemi)
npm run start:light             # come npm start, ma Rombo Light
npm run dist:linux:light        # release-light/ (anche dist:win:light, dist:mac:light; controlla il bundle con verify:light)
npm --prefix web run e2e:light  # Playwright sulla web in edizione Light (porta 4330)
```

L'edizione si sceglie in compilazione: `ng build -c production,light` (`npm --prefix web run build:light`) sostituisce
i tre file di `web/src/app/edition/` con le versioni `.light.ts`, e tutto il logico/SQL entra nell'app solo da lì;
`electron-builder.light.yml` dà al pacchetto l'identità Light. La CI pubblica Rombo Light con
`.github/workflows/release-light.yml` sui tag `light-v*`, in una release separata.

`web/` è l'app Angular di DiagrammiER; nel guscio il preload espone `window.rombo` e l'app nasconde
account e condivisione. Il build per tutti e tre i sistemi lo fa la CI (`.github/workflows/release.yml`)
sui tag `v*`. Se `npm ci` non scarica il binario di Electron: `node node_modules/electron/install.js`.
