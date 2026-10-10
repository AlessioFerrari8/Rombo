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

## Sviluppo

```bash
npm ci && npm run web:install   # dipendenze (guscio Electron + app Angular in web/)
npm start                       # compila web/ e apre Rombo (npm run dev -- file.rombo apre un file)
npm test                        # test del guscio (node --test); quelli dell'app: npm --prefix web test
npm run dist:linux              # release/ (anche dist:win, dist:mac sui rispettivi sistemi)
```

`web/` è l'app Angular di DiagrammiER; nel guscio il preload espone `window.rombo` e l'app nasconde
account e condivisione. Il build per tutti e tre i sistemi lo fa la CI (`.github/workflows/release.yml`)
sui tag `v*`. Se `npm ci` non scarica il binario di Electron: `node node_modules/electron/install.js`.
