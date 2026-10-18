# Field-sketch

A quick, local sketching tool for kitchen layouts, made for a cabinet specialist working from an iPad or iPhone. It sits in front of Syncly and the manufacturer catalogs: sketch the room, mark what's in it, and get a dimensioned starting point so drafting and ordering go faster.

See [docs/DESIGN.md](docs/DESIGN.md) for the full design and rules.

## Status

| Tab | State |
|---|---|
| Walls | Built: finger-drawn walls, dimension panel + keypad, doors, windows, open (construction) walls |
| Markings | Built: plumbing, outlet, gas, HVAC vent, column |
| Lowers | First pass: drag-to-fill cabinet runs, appliance markers, blind corners, islands, notes |
| Uppers | First pass: same, over a faint copy of the lowers, with crown and light rail clearance |

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
- Doors and windows ask for **rough opening**, **casing to casing** and **position** (distance from the nearest corner or neighbouring opening to the opening's rough-opening edge). Windows also ask for **sill height** and **window height**. Ceiling height is at the top of the panel.

**Markings tab:** pick a marker (plumbing, 120V outlet, 220V outlet, gas, HVAC vent, column), tap the sketch to place it, drag to move it. Columns ask for width and depth.

**Export:** the top bar's Export makes a **PDF** (drawing on the left, every door and window with size and position listed beside it, plus walls, utilities, appliances, cabinet runs and an order summary) or a PNG of the tab you are on.

**Save and Open:** the top bar's Save writes the sketch to a text file (`name-date.fieldsketch.json`) and Open reads one back. The sketch also autosaves in the browser. Tap the name under the title to rename the sketch.

**Lowers tab:** pick the Cabinets pencil and drag along a wall; the boxes fill in using the rules in `src/rules.js` (see the design notes). Swipe around an inside corner to make a run on each wall. Drop appliance markers (sink, cooktop, range, fridge, oven, dishwasher, pantry) to steer the layout; each asks how wide. Tap a blind corner cabinet to cycle its size. Tap a box to select its run and delete it. Drag in open floor for an island; the red band shows where islands can't go. The panel lists each run's boxes in order, notes like "no dishwasher marked", and an order summary.

**Uppers tab:** same drag-along-a-wall, over a faint copy of the lowers, with a blank place for the hood over a range or cooktop. Set upper height, crown and light rail in the bottom-left corner; crown and light rail leave extra room next to windows and doors.

Pinch to zoom and drag with two fingers to pan. **Fit** re-centers.

## Run it locally

```sh
npm run serve          # python3 -m http.server 8080, then open http://localhost:8080
npm test               # unit tests (node)
npm run e2e            # browser tests (walls, markers, cabinets); needs Playwright installed
```

## Put it on an iPad

The simplest way is GitHub Pages: in the repository settings, set Pages to deploy from a branch, pick the branch and the root folder, and open the published address in Safari. Then use Share > Add to Home Screen. After the first load it also works offline.

## Layout

- `index.html`, `styles.css`: the page
- `src/geometry.js`: snapping, closing a stroke into walls, solving wall lengths
- `src/rules.js`: every cabinet rule and number, in one place
- `src/fill.js`: the auto-fill (fits boxes around appliances)
- `src/layout.js`: turns runs, openings and markers into cabinet boxes
- `src/report.js`, `src/export.js`, `src/pdf.js`: the printed sketch (facts, page layout, and a small PDF writer)
- `src/recognize.js`: reading door, window and construction strokes
- `src/store.js`: sketch state, undo, local save
- `src/render.js`, `src/panel.js`, `src/main.js`: drawing, side panel, input
- `tests/`: unit tests and the browser smoke test

## License

GNU Affero General Public License, version 3 or later (AGPL-3.0-or-later). You're free to use, change and share it. If you run a modified version as an online service, you must offer its users the source code. See [LICENSE](LICENSE).
