// Cabinet rules in one place. Everything the auto-fill decides from lives here, so updating a rule
// means editing a number below.
//
// CONFIRMED  = stated by the user.
// PLACEHOLDER = a first guess, to be replaced from the catalog / real jobs.
//
// All sizes are inches.

export const RULES = {
  // Kitchen checklist numbers (the rules list the user supplied). Each is checked where the app
  // has the information; the rest become reminders. All CONFIRMED unless marked.
  checks: {
    doorMinClear: 32, // 1a: doorway width
    doorClearDeduct: 2, // PLACEHOLDER: clear width is about the rough opening minus this
    doorMaxDepth: 24, // 1a
    walkway: 36, // 1b
    workAisle: { 1: 42, 2: 48 }, // 1c: one cook / more than one
    triangleMax: 312, // 2: 26 ft total
    triangleLeg: [48, 108], // 2: no leg under 4 ft or over 9 ft
    seatClear: 36, // 4
    seatClearTraffic: 65, // 4
    areaSplit: 150, // sq ft: under = small kitchen, 150 and over = large
    wallFrontage: { small: 144, large: 186 }, // 6
    wallMinHeight: 30, // 6, 7
    sinkWallFrontage: 60, // 7
    sinkWallReach: 72, // 7
    baseFrontage: { small: 156, large: 192 }, // 8
    drawerFrontage: { small: 120, large: 165 }, // 9
    storageItems: 5, // 10
    knee: { high: 27, wide: 30, deep: 19 }, // 13
    floorSpace: { wide: 30, deep: 48 }, // 14
    dishwasherSide: 21, // 15
    dishwasherFromSink: 36, // 16
    cookClearProtected: 24, // 18
    cookClearUnprotected: 30, // 18
    ventCfm: 150, // 19
    windowAboveCook: 24, // 20
    windowBehindCook: 3, // 20
    microwaveCabinetMin: 27, // 21
    microwaveHeight: [24, 48], // 21
    sinkCounter: [24, 18], // 22
    microwaveLanding: [15, 16], // 23
    fridgeCounter: 15, // 24
    cookCounter: 15, // 25
    prepCounter: 36, // 26
    cookSurface: 36, // height of a range top, for rule 20
  },

  lower: {
    depth: 24, // placeholder: standard base depth
    sizes: [12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42], // confirmed: 12 is the smallest standard size, up to 42 in 3" steps
    // Corner options, in the order tapping a corner cycles through them: blind corner 36, the
    // diagonal 36 (a 36" leg along each wall with a 45 degree front), then the other blind corners.
    // CONFIRMED: blind 36 and diagonal 36 (36 is the one every line has). PLACEHOLDER: 39, 42.
    corners: [
      { type: 'blind', width: 36 },
      { type: 'diag', leg: 36 },
      { type: 'blind', width: 39 },
      { type: 'blind', width: 42 },
    ],
  },
  upper: {
    depth: 12, // placeholder: standard wall cabinet depth
    sizes: [12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42], // placeholder: same steps as lowers
    // CONFIRMED: the diagonal upper is 24". PLACEHOLDER: blind upper widths.
    corners: [
      { type: 'blind', width: 24 },
      { type: 'diag', leg: 24 },
      { type: 'blind', width: 27 },
      { type: 'blind', width: 30 },
    ],
  },

  // Widest a sink or cooktop box gets unless nothing smaller makes the stretch work. PLACEHOLDER.
  flexMax: 36,

  // Biggest filler strip allowed to take up slack at the end of a run or beside an appliance.
  maxFiller: 3, // PLACEHOLDER

  casingClearance: 1, // confirmed: cabinets stay 1" off door/window casing
  lowerWindowSill: 36, // confirmed: lowers only respect windows whose sill is under this
  islandClearance: 36, // confirmed: no island within 36" of cabinets
  dishwasherMaxFromSink: 36, // confirmed: dishwasher within 3 ft of the sink

  // Width asked for when an appliance marker is dropped. The user can change it. PLACEHOLDER.
  defaultWidths: { sink: 24, cooktop: 30, range: 30, fridge: 36, oven: 30, dishwasher: 24, waste: 18, microwave: 30 },

  // Which utility markers an appliance must be touching. Confirmed: oven and range use 220V or
  // gas; fridge and dishwasher use a standard outlet. Sink and cooktop follow "handles like sink".
  hookups: {
    range: ['outlet220', 'gas'],
    oven: ['outlet220', 'gas'],
    cooktop: ['outlet220', 'gas'],
    fridge: ['outlet'],
    dishwasher: ['outlet'],
    sink: ['plumbing'],
  },

  // How close a utility marker must be to count as "touching" an appliance marker. PLACEHOLDER.
  hookupReach: { along: 6, out: 24 },

  // How far from a run's line a marker may sit and still belong to that run. PLACEHOLDER.
  markerReach: { behind: 12, out: 48 },

  // Appliances with no hookup touching can slide until their center is this many widths away.
  freeShiftWidths: 1, // confirmed "within reason"; the exact distance is a PLACEHOLDER

  // A drag this far in front of a cabinet's face still counts as drawing along the wall; any
  // further out it is an island. PLACEHOLDER.
  wallSnapOut: 14,

  // Run ends this close to a blocker snap to it. PLACEHOLDER.
  snapDistance: 18,

  // Run ends this close to a wall corner count as being in the corner, so two runs that meet
  // there pair up (one gets the blind corner, the other stops short) instead of overlapping.
  // PLACEHOLDER.
  cornerReach: 30,
};

// What each appliance marker turns into in a run.
//   void  = nothing goes there, fixed width (dishwasher, range)
//   tall  = full-height, fixed width, same spot in lowers and uppers (fridge, oven)
//   flex  = a cabinet box at least as wide as the marker (sink, cooktop)
//   pantry = no width of its own; any box under it becomes full height
//   none  = a marker that checks rules but doesn't steer the layout (microwave)
export const MARKER_KIND = {
  waste: 'flex',
  microwave: 'none',
  dishwasher: 'void',
  range: 'void',
  fridge: 'tall',
  oven: 'tall',
  sink: 'flex',
  cooktop: 'flex',
  pantry: 'pantry',
};

export const APPLIANCE_TYPES = ['sink', 'cooktop', 'range', 'fridge', 'oven', 'dishwasher', 'pantry', 'waste', 'microwave'];
export const UTILITY_TYPES = ['plumbing', 'outlet', 'outlet220', 'gas', 'vent', 'column'];

export const APPLIANCE_NAMES = {
  sink: 'Sink',
  cooktop: 'Cooktop',
  range: 'Range',
  fridge: 'Fridge',
  oven: 'Oven',
  dishwasher: 'Dishwasher',
  pantry: 'Pantry',
  waste: 'Waste',
  microwave: 'Microwave',
};
