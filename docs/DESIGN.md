# Field-sketch: Design Notes

Status: brainstorm captured, no code yet. Cabinet-fill rules (standard widths, corners, fillers) and the conflict priority order are still to come.

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
- Windows prompt for **rough opening** and **casing-to-casing**, plus **sill height** and **window height**.
- Both sizes are kept because cabinets must stay clear of the casing (see clearance rules below). The minimum distance is a cabinet rule, not part of the opening.
- Doors and windows are annotated with a dimension line off the side of the drawing.
- **Ceiling height** is entered on this tab.

## Tab 2: Markings

The dimension panel is replaced by a small marker toolbox. Markers drop wherever they are placed (wall or floor), and **markers do not snap**.

- Plumbing stub-out
- Outlet
- Gas
- HVAC vent
- Column / pillar (asks for its size)

## Tab 3: Lowers

The toolbox holds small **constraint markers** for the auto-fill tool, plus the cabinet drawing pencil. Cabinet runs are drawn like walls: drag a finger along a wall and the app picks the box sizes that fit, using the rules below.

### Markers are constraints, not cabinets

A marker is a small dropped symbol. It is **not** a box and is never dragged around to tidy up. Each marker asks for its **width** when dropped. Markers do not snap to each other or to walls. Markers in a small cluster (for example a sink marker, a plumbing stub and a window) all count together for whichever cabinet box falls over them.

Markers: **fridge, range, cooktop, oven, sink, dishwasher, pantry.** Cooktop, oven and range are three separate markers.

When the cabinet tool draws a run across a marker, it turns that marker into a box in the run:

| Marker | Result in the run |
|---|---|
| Fridge | A **void** box of the marker's width (e.g. F36). A void is drawn in a distinct color with an X through it: it is the absence of a cabinet. It also automatically adds a **fridge panel** beside it, unless the void is against a wall or corner, or a full-height pantry is already next to it. |
| Dishwasher | A 24" void, same treatment. Must be within 36" of the sink. |
| Range | A void the width of the marker, taking the whole base slot. (To confirm.) |
| Sink | A specialty-colored cabinet box at least as wide as the sink marker (rounded up to a standard width), carrying a sink symbol. |
| Cooktop | A cabinet box with a cooktop symbol. (To confirm.) |
| Oven | To be confirmed. |
| Pantry | No box of its own: any cabinet box that intersects it becomes full height (floor to ceiling). |

### Sliding and hookups

- A void or box may **slide anywhere in the run** as long as it stays touching its own marker (and the hookup marker it was touching when placed). That is the answer to "how far may an appliance shift."
- If a fridge, range or cooktop was **already touching** a power or gas marker when dropped, auto-fill may not shift it off that hookup.
- If it was **not** touching one, auto-fill may move it anywhere in the run, within reason.
- If no power or gas marker is near it, placement is allowed but a small **"No hookups marked"** note is added. The user may be working from plans before rough-in, or the client needs to know.
- A sink box must stay touching **both** the sink marker and the plumbing marker, and prefers to be **centered on a window** behind it. Once a sink marker is there, that centering is firm. In practice "centered" means as close to centered as standard sizes allow.

### Worked example (priority rules)

A 51" wall run has a window in the middle and a 24" sink marker in front of it. Constraints: a 24" sink box, centered on the window as closely as possible. With 51" total, that box can't be perfectly centered with clean sizes on both sides, so the app may choose 18" on one side and 9" on the other. The sink box sits about 4 1/2" off center because standard widths allow nothing closer.

Suggested priority order (to confirm): hard constraints first (sink box minimum width, touching required markers, casing clearance), then centering on the window, then clean standard widths and the fewest boxes.

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
- Two number inputs, **Crown** and **Light rail**, both default to **0** (meaning none). They are annotated on the drawing so the user remembers the client wants them.
- Any nonzero value adds clearance: the end of an upper run needs that much extra room so the molding does not clip a window, vent hood, etc. If both are filled in, the **larger** value is used for clearance. Typical values (to be confirmed): light rail 1 to 2", crown 3 to 4".
- The casing minimum (1") and the crown/light rail clearance apply to uppers on top of each other where relevant.

## Settings

A small settings page may hold defaults the user can adjust: casing clearance (1"), the 36" window sill threshold, island clearance (36"), and default crown and light rail values.

## Output

- Save each sketch by job name, stored locally.
- Export an image or PDF showing wall dimensions, openings, and the cabinet run labeled in order, to use as a reference while building the order in Syncly.

## Platform

- Start as a web app (PWA) that works offline and runs in iPad/iPhone Safari. Native iOS can come later if it is needed.
- Keep the geometry and cabinet-fill logic independent of the UI so it can be ported.

## Open questions

- Cabinet-fill rules: standard widths by type, corner handling (blind, lazy Susan, diagonal), filler preferences.
- Whether the range is a void and the cooktop and oven behave as drawn above.
- Whether a dishwasher is auto-added when only a sink marker is placed, or only when its marker is dropped.
- Confirm the priority order for conflicting constraints.
- Exact crown and light rail values (user will measure), and whether they are set per job or in settings.
- Full set of clearance rules (island 36" and others).
