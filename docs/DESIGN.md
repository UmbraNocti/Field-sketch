# Field-sketch: Design Notes

Status: the Walls and Markings tabs are built (see the README). Lowers and Uppers are not built yet. First-pass cabinet rules are recorded below (from memory; to be refined against the catalogs).

## Purpose

A fast, local, touch-first sketching tool for cabinet specialists, used in the field on an iPad or iPhone. It does **not** replace Syncly (formerly 2020) or the manufacturer catalogs. It produces a quick, dimensioned starting layout so that drafting in Syncly is just drafting and ordering, not blind catalog-flipping.

Primary user: a cabinet specialist at 84 Lumber (Knoxville). Main lines sold: 1951 (odd actual widths, e.g. a "36" is about 36 1/8") and Ardito.

## Principles

- Sketch tool, not an order tool. Rough is fine: the user decides exact SKUs (sink base vs. drawer base, etc.) in the catalog.
- Nominal sizes only. 1951's odd sizes are handled by the user in Syncly with fillers. No per-line size tables for now.
- Runs locally and offline. No accounts.
- Dimensions are preserved: the drawing redraws to true entered lengths.
- Never block the user. Missing information is flagged with color and small annotations, not modal errors.
- Measurements are entered in inches, rounded to the nearest 1/8", on a numeric-only keypad. No laser measure (dropped).
- No gestures. Multi-finger gestures conflict with iPadOS, so tools are chosen from a pencil tray.

## As built so far (Walls and Markings)

- A room is drawn in **one stroke**. Drawing again replaces it (undoable).
- Door pencil: two lines across a wall make an opening; one arc (latch end on the wall, free end out from the hinge) makes a door with its swing. An arc over an existing door resets its swing.
- Window pencil: two lines across a wall.
- Open-wall pencil: a scribble or swipe toggles a wall between wall and construction line. Doors and windows on a wall that becomes open are removed (undoable).
- Entered wall lengths are kept exactly. Walls without a number are adjusted just enough to close the loop. If the entered numbers can't close it, the gap is shown instead of being hidden.
- Markers are free-placed, draggable and deletable. Columns ask for width and depth.
- The sketch autosaves in the browser and works offline once loaded.
- **Save** writes a plain-text `.fieldsketch.json` file named after the job (on a tablet it opens the share sheet, so it can go to Files). **Open** reads one back. Files from other apps are refused, and damaged pieces are dropped when reading.

## Layout

- **Dimension panel** on one side: a list of every wall, door and window that needs a number. Entries are color-coded (missing vs. entered). They can be ignored, and the user can fill them in at any time.
- **Pencil tray** along the bottom: one pencil per drawing tool in the current tab.
- **Four tabs**, in order: Walls, Markings, Lowers, Uppers.

## Tab 1: Walls

Pencils:

| Pencil | Behavior |
|---|---|
| Wall | Freehand strokes snap to straight lines at 0, 90 and 45 degrees. Walls snap together and the shape **always closes**. |
| Door | Draw two short lines across a wall to place an opening. Draw an arc to set the swing direction and place the door marking. |
| Window | Draw two lines across a wall to place a window. |
| Construction line | Scribble or swipe across a wall section to turn it into a construction line: it stays in the closed shape but is no longer a wall (open kitchen sides, pass-throughs). |

Dimensions:

- The panel prompts for every wall length. All can be skipped, but missing ones are color-coded.
- Doors prompt for **rough opening** and **casing-to-casing**.
- Windows prompt for **rough opening** and **casing-to-casing**, plus **position**, **sill height** and **window height**.
- **Position** is how far the window's rough opening sits from the nearest wall corner or the neighbouring opening, chosen when the window is drawn. It is measured to the rough-opening edge and labeled on the drawing (for example "30 to Door 1"). Once entered, the window is placed exactly there and stays put if the wall length changes.
- Both sizes are kept because cabinets must stay clear of the casing (see clearance rules below). The minimum distance is a cabinet rule, not part of the opening.
- Doors and windows are annotated with a dimension line off the side of the drawing.
- **Ceiling height** is entered on this tab.

## Tab 2: Markings

The dimension panel is replaced by a small marker toolbox. Markers drop wherever they are placed (wall or floor), and **markers do not snap**.

- Plumbing stub-out
- Outlet (120V)
- Outlet (220V), separate from the standard outlet: for ovens and ranges
- Gas
- HVAC vent
- Column / pillar (asks for its size)

## Tab 3: Lowers

The toolbox holds small **constraint markers** for the auto-fill tool, plus the cabinet drawing pencil. Cabinet runs are drawn like walls: drag a finger along a wall and the app picks the box sizes that fit, using the rules below.

### Markers are constraints, not cabinets

A marker is a small dropped symbol. It is **not** a box and is never dragged around to tidy up. Each marker asks for its **width** when dropped. Markers do not snap to each other or to walls. Markers in a small cluster (for example a sink marker, a plumbing stub and a window) all count together for whichever cabinet box falls over them.

Markers: **fridge, range, cooktop, oven, sink, dishwasher, pantry.** Cooktop, oven and range are three separate markers.

When the cabinet tool draws a run across a marker, it turns that marker into a box in the run. Markers fall into three groups:

| Group | Markers | Behavior |
|---|---|---|
| **Fixed void** | Dishwasher, range | Where one of these sits, no cabinet can go. Its width is fixed: a 24" dishwasher gets exactly 24", a 36" range exactly 36", no more, no less. Drawn as a distinct color with an X through it (the absence of a cabinet). May need end panels. A dishwasher must be within 36" of the sink. |
| **Fixed full-height** | Fridge, oven, pantry | Treated as a full-height (pantry) cabinet in **both** the lowers and uppers layers. Fixed width: a 36" oven means a 36" pantry cabinet. A fridge adds a **fridge panel** beside it unless it is against a wall or corner, or next to a full-height pantry. If the user wants a fridge cabinet above, they set the fridge width to the width of that cabinet. There is no separate "fridge cabinet" marker. If an oven only goes below, the user changes that in Syncly. |
| **Flexible box** | Sink, cooktop | A specialty-colored cabinet box carrying the symbol, at least as wide as the marker (larger, never smaller). The box may be larger if that fits the rules better: a 24" sink can sit in a 27" box. |

### Sliding and hookups

- A void, full-height or box may **slide anywhere in the run** as long as it stays touching its own marker (and the hookup marker it was touching when placed). That is the answer to "how far may an appliance shift."
- If a fridge, range, oven or cooktop was **already touching** a power or gas marker when dropped, auto-fill may not shift it off that hookup.
- If it was **not** touching one, auto-fill may move it anywhere in the run, within reason.
- If no power or gas marker is near it, placement is allowed but a small **"No hookups marked"** note is added. The user may be working from plans before rough-in, or the client needs to know.
- A sink box must stay touching **both** the sink marker and the plumbing marker, and prefers to be **centered on a window** behind it. Once a sink marker is there, that centering is firm. In practice "centered" means as close to centered as standard sizes allow.

### Worked example (priority rules)

A 51" wall run has a window in the middle and a 24" sink marker in front of it. Constraints: a 24" sink box, centered on the window as closely as possible. With 51" total, that box can't be perfectly centered with clean sizes on both sides, so the app may choose 18" on one side and 9" on the other. The sink box sits about 4 1/2" off center because standard widths allow nothing closer.

### Priority order (confirmed)

When constraints conflict, the auto-fill resolves them in this order:

1. **Hard constraints**: fixed widths, required marker contact, minimum box widths, casing clearance.
2. **Centering** (for example the sink box on a window).
3. **Clean widths**: standard sizes only.
4. **Symmetry** across the run.
5. **Fewest boxes.**

### Standard widths and corners (first pass)

- Standard base widths run from **15" to 42" in 3" steps** (15, 18, 21, 24, 27, 30, 33, 36, 39, 42). 12" may be added after checking the catalog. 42" is the largest size used, and the priority order should rarely reach for it.
- **Corners are always a blind corner cabinet by default.** Tapping a corner cabinet cycles through every available option that fits. The list of corner options and dimensions is to be added later from the catalog.
- Anything else (lazy Susan, diagonal, etc.) is the user's call in Syncly.

### Missing-item notes

The app does not auto-add a dishwasher. If none has been marked, a note somewhere visible says **"No dishwasher"**, like the "No hookups marked" note, so the user and client both see it.

### Clearances (lowers)

- Cabinets stay at least **1"** from door and window casing (default; adjustable).
- Lowers respect window casing **only if the sill is under 36"**. A window with a sill of 36" or higher is ignored by lowers.
- Leftover widths at the end of a run are shown, so the user can decide what fits (a filler, a spice rack, etc.). There is no specialty-cabinet toolbox: odd items are the user's call in the catalog.

### Islands

- Boxes may be drawn off walls, for islands and peninsulas. They prefer to snap to a wall when near one.
- Once cabinets exist, the app shows **red constraint zones** where more cannot go (for example an island must be at least 36" from other cabinets). This makes it easy to show a client that their island does not fit.

## Tab 4: Uppers

- Same drag-along-the-wall drawing as Lowers, with a ghost of the lowers underneath so runs line up.
- The user annotates the **upper height** wanted (for example 42" uppers, or 96" going to the ceiling).
- Pantry markers carry over from the lowers.
- Two number inputs in the corner of the drawing, **Crown** and **Light rail**, are set **per drawing** and both default to **0** (meaning none). They are annotated on the drawing so the user remembers the client wants them.
- Any nonzero value adds clearance: the end of an upper run needs that much extra room so the molding does not clip a window, vent hood, etc. If both are filled in, the **larger** value is used for clearance. Typical values (to be confirmed): light rail 1 to 2", crown 3 to 4".
- The 1" casing minimum and the crown/light rail clearance both apply to uppers.

## App defaults

There is no settings page. Anything not set per drawing is a fixed default in the app: casing clearance (1"), the 36" window sill threshold, island clearance (36"), and standard cabinet widths. These can be changed in code if needed.

## Output

- Save each sketch by job name, stored locally.
- Export an image or PDF showing wall dimensions, openings, and the cabinet run labeled in order, to use as a reference while building the order in Syncly.

## Platform

- Start as a web app (PWA) that works offline and runs in iPad/iPhone Safari. Native iOS can come later if it is needed.
- Keep the geometry and cabinet-fill logic independent of the UI so it can be ported.

## Open questions

- Corner cabinet options and dimensions (to add from the catalog).
- Whether 12" is a standard width (check the catalog).
- Exact crown and light rail values (user will measure).
- Full set of clearance rules (island 36" and others).
- Upper cabinet widths and heights (assumed to follow the same width steps for now).
