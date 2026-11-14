# Training (persoonlijke trainingsapp)

Offline-app (PWA) voor op je telefoon. Geen account, geen server: alles staat op je eigen toestel.

## Online zetten met GitHub Pages
1. Maak op github.com een nieuwe **publieke** repository (bijv. `training`).
2. Upload alle bestanden uit deze map (index.html, app.js, engine.js, style.css, sw.js, manifest.webmanifest, map icons/).
3. Repository → Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `/ (root)` → Save.
4. Na ~1 minuut staat de app op `https://<jouw-gebruikersnaam>.github.io/<repo-naam>/`.

## Installeren op Samsung
- Chrome: ⋮ → Add to Home screen → Install
- Samsung Internet: ☰ → Add page to → Home screen

## Tests (optioneel)
`tests/` bevat de Python-referentie, testvectoren en de browsertest. `node tests/replay.js` vergelijkt de JavaScript-logica met de Python-versie.

## Nieuwe versie uitrollen
Verhoog `CACHE` in `sw.js` (bijv. `training-v2`) zodat telefoons de nieuwe bestanden ophalen.
