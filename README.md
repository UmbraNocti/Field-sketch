# Field-sketch

A quick, local sketching tool for kitchen layouts, made for a cabinet specialist working from an iPad or iPhone. It sits in front of Syncly (formerly 2020) and the manufacturer catalogs: sketch the room, mark what's in it, and get a dimensioned starting point so drafting and ordering go faster.

## What it's for

It does **not** replace Syncly or 2020, and it isn't meant to produce a finished, sellable design (a very simple kitchen might get close). Its job is to be fast in the field:

- Get every measurement you need, and get them right: walls that must close, doors and windows with rough opening, casing-to-casing, position and swing, utilities marked on the drawing.
- Then sketch cabinets the way you would with a pencil. There is no picking cabinets from a catalog. Pick the Cabinets pencil and drag a finger along a wall, and the boxes fill in using rules built into the app (standard sizes, fillers, windows and doors kept clear, blind and diagonal corners, hood place over the range, dishwasher end panels, and so on).
- Drop appliance markers (sink, cooktop, range, fridge, oven, dishwasher, pantry, waste, microwave) and the layout works around them: the sink centers on its window, the range stays over its hookup, a pantry marker becomes a pantry cabinet of the width you give it.
- Let the Rules tab check the layout against a kitchen checklist (walkways, work aisle, work triangle, counter beside the sink, fridge and range, clear floor at each appliance, and more) and remind you about the things a sketch can't prove.

What you come away with is a set of constraints: the range fits here, a 36" corner fits there, a 12" cabinet fits on the end with 3" left over for a filler. You don't have to guess any of it. Then you draft in Syncly with those answers in hand.

### Where it came from

The author wrote it for their own work and then used it on two real kitchens: their own house, laid out start to finish in an afternoon, and an old job that never had a layout that worked. For the old job, redrawing the room on a tablet, with a different fridge spot, walls opened up, and a peninsula in place of an island that didn't fit, took about an hour. The sketch gave a layout that could be looked at and judged, and the work in Syncly that followed was mostly drafting. The app doesn't make the design decisions. It shows what fits, quickly, so those decisions can be made with real numbers.

It's an opinionated tool built around one person's workflow and one set of cabinet lines. Several numbers (see `src/rules.js`) are placeholders until checked against a catalog. Treat its output as a rough layout, check all sizes before ordering, and expect to tweak it.

See [docs/DESIGN.md](docs/DESIGN.md) for the full design and rules.

## Status

| Tab | State |
|---|---|
| Walls | Built: finger-drawn walls, dimension panel + keypad, doors, windows, open (construction) walls |
| Markings | Built: plumbing, outlet, gas, HVAC vent, column |
| Rules | 26-point kitchen checklist with reminders; work triangle ghosted on Lowers |
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

**Lowers tab:** pick the Cabinets pencil and drag along a wall; the boxes fill in using the rules in `src/rules.js` (see the design notes). Swipe around an inside corner to make a run on each wall. Drop appliance markers (sink, cooktop, range, fridge, oven, dishwasher, pantry) to steer the layout; each asks how wide. Tap a corner cabinet to cycle blind 36 → diagonal 36 → other blind sizes. Waste and microwave markers are in the tray; the Cooks chip (bottom left) sets work-aisle width for the checks. Tap a box to select its run and delete it. Drag in open floor for an island; the red band shows where islands can't go. The panel lists each run's boxes in order, notes like "no dishwasher marked", and an order summary.

**Rules tab:** the kitchen rules, checked against the sketch and grouped into needs attention / check these / looks good (the same list is on a page of the PDF). The dashed blue triangle on Lowers is the work triangle.

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
