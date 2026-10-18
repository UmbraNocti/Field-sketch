// Cabinet rules in one place. Everything the auto-fill decides from lives here, so updating a rule
// means editing a number below.
//
// CONFIRMED  = stated by the user.
// PLACEHOLDER = a first guess, to be replaced from the catalog / real jobs.
//
// All sizes are inches.

export const RULES = {
  lower: {
    depth: 24, // placeholder: standard base depth
    sizes: [15, 18, 21, 24, 27, 30, 33, 36, 39, 42], // confirmed: 15 to 42 in 3" steps (12" to be checked)
    cornerOptions: [36, 39, 42], // PLACEHOLDER: blind corner widths; tap a corner cabinet to cycle
  },
  upper: {
    depth: 12, // placeholder: standard wall cabinet depth
    sizes: [15, 18, 21, 24, 27, 30, 33, 36, 39, 42], // placeholder: same steps as lowers
    cornerOptions: [24, 27, 30], // PLACEHOLDER: blind corner wall cabinet widths
  },

  // Widest box the fill uses unless nothing else makes the run work. 42 is the largest size
  // that exists, but it is a last resort. PLACEHOLDER.
  preferredMax: 36,

  // Widest a sink or cooktop box gets unless nothing smaller makes the stretch work. PLACEHOLDER.
  flexMax: 36,

  // Biggest filler strip allowed to take up slack at the end of a run or beside an appliance.
  maxFiller: 3, // PLACEHOLDER

  casingClearance: 1, // confirmed: cabinets stay 1" off door/window casing
  lowerWindowSill: 36, // confirmed: lowers only respect windows whose sill is under this
  islandClearance: 36, // confirmed: no island within 36" of cabinets
  dishwasherMaxFromSink: 36, // confirmed: dishwasher within 3 ft of the sink

  // Width asked for when an appliance marker is dropped. The user can change it. PLACEHOLDER.
  defaultWidths: { sink: 24, cooktop: 30, range: 30, fridge: 36, oven: 30, dishwasher: 24 },

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
export const MARKER_KIND = {
  dishwasher: 'void',
  range: 'void',
  fridge: 'tall',
  oven: 'tall',
  sink: 'flex',
  cooktop: 'flex',
  pantry: 'pantry',
};

export const APPLIANCE_TYPES = ['sink', 'cooktop', 'range', 'fridge', 'oven', 'dishwasher', 'pantry'];
export const UTILITY_TYPES = ['plumbing', 'outlet', 'outlet220', 'gas', 'vent', 'column'];

export const APPLIANCE_NAMES = {
  sink: 'Sink',
  cooktop: 'Cooktop',
  range: 'Range',
  fridge: 'Fridge',
  oven: 'Oven',
  dishwasher: 'Dishwasher',
  pantry: 'Pantry',
};
