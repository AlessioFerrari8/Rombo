# Rombo

Editor di diagrammi entità-relazione in notazione Chen, con validazione, schema logico e SQL.
Versione **desktop** (Windows, Linux, macOS) di DiagrammiER: gira offline, i diagrammi stanno sul
computer e si scambiano come file (Esporta → JSON, Apri file dalla home). Nessun account, nessun server.

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
npm start                       # compila web/ e apre Rombo
npm run dist:linux              # release/ (anche dist:win, dist:mac sui rispettivi sistemi)
```

`web/` è l'app Angular di DiagrammiER; nel guscio il preload espone `window.rombo` e l'app nasconde
account e condivisione. Il build per tutti e tre i sistemi lo fa la CI (`.github/workflows/release.yml`)
sui tag `v*`. Se `npm ci` non scarica il binario di Electron: `node node_modules/electron/install.js`.
