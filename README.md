# Field-sketch

A quick, local sketching tool for kitchen layouts, made for a cabinet specialist working from an iPad or iPhone. It sits in front of Syncly and the manufacturer catalogs: sketch the room, mark what's in it, and get a dimensioned starting point so drafting and ordering go faster.

See [docs/DESIGN.md](docs/DESIGN.md) for the full design and rules.

## Status

| Tab | State |
|---|---|
| Walls | Built: finger-drawn walls, dimension panel + keypad, doors, windows, open (construction) walls |
| Markings | Built: plumbing, outlet, gas, HVAC vent, column |
| Lowers | Not built yet |
| Uppers | Not built yet |

## Using it

It's a static web app with no build step and no accounts. Everything is saved in the browser on the device.

**Walls tab**
- Pick a pencil from the tray at the bottom.
- **Walls:** draw the whole room in one stroke. It snaps to straight lines and 45 degree angles and closes itself. Drawing again replaces the room (Undo brings it back).
- **Door:** draw two short lines across a wall to set the opening, or draw one arc for the swing. An arc over an existing door changes its swing.
- **Window:** draw two short lines across a wall.
- **Open wall:** scribble or swipe along a wall to turn it into a construction line. Do it again to restore it.
- Tap a wall or an opening to enter its dimensions. The keypad takes inches and eighths. **Next** walks through whatever is still missing.
- Missing numbers are orange, entered ones are green. If the measured walls don't close, the panel says how far off they are.
- Doors and windows ask for **rough opening** and **casing to casing**. Windows also ask for **sill height** and **window height**. Ceiling height is at the top of the panel.

**Markings tab:** pick a marker, tap the sketch to place it, drag to move it. Columns ask for width and depth.

Pinch to zoom and drag with two fingers to pan. **Fit** re-centers.

## Run it locally

```sh
npm run serve          # python3 -m http.server 8080, then open http://localhost:8080
npm test               # unit tests (node)
node tests/e2e/smoke.mjs   # browser smoke test, needs Playwright and the server running
```

## Put it on an iPad

The simplest way is GitHub Pages: in the repository settings, set Pages to deploy from a branch, pick the branch and the root folder, and open the published address in Safari. Then use Share > Add to Home Screen. After the first load it also works offline.

## Layout

- `index.html`, `styles.css`: the page
- `src/geometry.js`: snapping, closing a stroke into walls, solving wall lengths
- `src/recognize.js`: reading door, window and construction strokes
- `src/store.js`: sketch state, undo, local save
- `src/render.js`, `src/panel.js`, `src/main.js`: drawing, side panel, input
- `tests/`: unit tests and the browser smoke test
