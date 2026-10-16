# Field-sketch: Design Notes

Status: brainstorm captured, no code yet. Cabinet-fill rules (widths, corners, fillers) are still to come.

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
- Doors prompt for **rough opening** and **casing-to-casing**, plus the left and right clearance to adjacent features.
- Windows prompt for **rough opening** and **casing-to-casing**, plus **sill height** and **window height**, and left/right clearance.
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

The toolbox holds appliance and specialty markers. Cabinet runs are drawn like walls: drag a finger along a wall and the app auto-selects the box sizes that fit, using the rules (TBD, see below).

Appliance markers (these decide what cabinet goes under or around them):

- Refrigerator
- Range
- Oven
- Cooktop
- Pantry (see below)
- Sink (asks for the sink size, which sets the minimum cabinet size under it)

Other behavior:

- **Dishwasher** is a standard 24" and is auto-placed like a cabinet by rule. It must be within 36" of the sink.
- **Pantry marker**: any cabinet that intersects it becomes full height (floor to ceiling). It is a marker, not a drawn cabinet.
- **Appliances snap to walls** like cabinets. They do not snap to hookup markers.
- **Hookup check**: a range or fridge needs a power or gas marker touching or near it (a loose collision zone). If none is there, placement is still allowed, but a small annotation says **"No hookups marked"**. The user may be working from plans before rough-in, or the client needs to be told.
- **Appliances may shift slightly** if that gives a better cabinet layout. For example, a 36" range marker can move a little so the runs on each side come out in clean sizes.
- Specialty cabinets (placed like markers): spice drawer (6" for now, to be confirmed; may also come in 12"), trash pull-out. The list is still open.

## Tab 4: Uppers

- Same drag-along-the-wall drawing as Lowers, with a ghost of the lowers underneath so runs line up.
- The user annotates the **upper height** wanted (for example 42" uppers, or 96" going to the ceiling).
- Pantry markers carry over from the lowers.

## Output

- Save each sketch by job name, stored locally.
- Export an image or PDF showing wall dimensions, openings, and the cabinet run labeled in order, to use as a reference while building the order in Syncly.

## Platform

- Start as a web app (PWA) that works offline and runs in iPad/iPhone Safari. Native iOS can come later if it is needed.
- Keep the geometry and cabinet-fill logic independent of the UI so it can be ported.

## Open questions

- Cabinet-fill rules: standard widths by type, corner handling (blind, lazy Susan, diagonal), filler preferences, symmetry around the sink and range.
- Exact spice-drawer widths (6" vs. 12").
- Full list of specialty cabinets.
- How far an appliance may shift during auto-fill.
- Whether the sink marker should place the sink base automatically, and how plumbing markers relate to it.
