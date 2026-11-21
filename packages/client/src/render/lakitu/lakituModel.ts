// Lakitu's model, written by scripts/lakitu-model.py from a rip of Mario Kart 8's referee: its
// folder of parts under /assets/models (a part for each pose of him, named for it, with what he
// holds in it in his fist; `hook`, the eye its line ties to at its origin; all painted by
// `lakitu.png`), and for each pose where the tip of his rod is, which the line hangs from. In his
// own frame: x to his right, y up, z ahead, the middle of him over his cloud at the origin.
export const LAKITU = {
  folder: 'lakitu',
  fishing: { tip: [-0.1, 1.338, 1.639] },
} as const;
