import { tuning } from "@cg/shared";

const STORAGE_KEY = "cg-tuning-v1";

/** Groups that are safe to edit live (capsule settings need a physics rebuild, so they are excluded). */
const LIVE_GROUPS = ["move", "air", "jump"] as const;
type LiveGroup = (typeof LIVE_GROUPS)[number];

/** Sensible slider ranges per field; anything missing gets an automatic range. */
const RANGES: Record<string, [number, number, number]> = {
  "move.accel": [5, 80, 1],
  "move.friction": [5, 120, 1],
  "move.turnDecel": [10, 200, 1],
  "move.maxSpeed": [3, 25, 0.5],
  "move.overSpeedDecel": [0, 40, 1],
  "move.slopeFactor": [0, 1.5, 0.05],
  "air.gravity": [10, 80, 1],
  "air.maxFall": [10, 60, 1],
  "air.control": [0, 1, 0.05],
  "air.drag": [0, 1, 0.05],
  "jump.velocity": [4, 25, 0.5],
  "jump.releaseCut": [0, 1, 0.05],
  "jump.coyoteTime": [0, 0.3, 0.01],
  "jump.bufferTime": [0, 0.3, 0.01],
};

type Numbers = Record<string, number>;

function liveValues(): Record<LiveGroup, Numbers> {
  return Object.fromEntries(LIVE_GROUPS.map((g) => [g, { ...(tuning[g] as Numbers) }])) as Record<
    LiveGroup,
    Numbers
  >;
}

function apply(values: Partial<Record<LiveGroup, Numbers>>) {
  for (const g of LIVE_GROUPS) {
    const src = values[g];
    if (!src) continue;
    const dst = tuning[g] as Numbers;
    for (const [k, v] of Object.entries(src)) {
      if (k in dst && typeof v === "number" && Number.isFinite(v)) dst[k] = v;
    }
  }
}

/** Restores tweaks saved in this browser. Called at start-up in debug mode only. */
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) apply(JSON.parse(raw));
  } catch {
    // Storage can be unavailable or hold junk: just use the defaults.
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(liveValues()));
  } catch {
    // Not critical.
  }
}

/** Shows the live tuning panel when the page URL contains ?debug. */
export async function maybeShowDebugPanel() {
  if (!new URLSearchParams(location.search).has("debug")) return;
  const defaults = liveValues();
  loadSaved();

  const { default: GUI } = await import("lil-gui");
  const gui = new GUI({ title: "Tuning (?debug)", width: 300 });

  const controllers: { updateDisplay(): void }[] = [];
  for (const g of LIVE_GROUPS) {
    const folder = gui.addFolder(g);
    const obj = tuning[g] as Numbers;
    for (const key of Object.keys(obj)) {
      const r = RANGES[`${g}.${key}`];
      const c = r ? folder.add(obj, key, r[0], r[1], r[2]) : folder.add(obj, key);
      c.onChange(save);
      controllers.push(c);
    }
  }

  const actions = {
    copyJson: async () => {
      const json = JSON.stringify(liveValues(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
        copyCtrl.name("Скопійовано ✓");
      } catch {
        console.log(json);
        copyCtrl.name("Не вдалося — JSON у консолі");
      }
      setTimeout(() => copyCtrl.name("Скопіювати JSON"), 1500);
    },
    reset: () => {
      apply(defaults);
      save();
      for (const c of controllers) c.updateDisplay();
    },
  };
  const copyCtrl = gui.add(actions, "copyJson").name("Скопіювати JSON");
  gui.add(actions, "reset").name("Скинути до стандартних");
}
