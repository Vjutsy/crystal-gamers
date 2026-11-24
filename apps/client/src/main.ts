import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import {
  collectCrystals,
  createPlayer,
  type PlayerSim,
  ringOfCrystals,
  SIM_DT,
  stepPlayer,
} from "@cg/shared";
import { tr } from "./i18n.ts";
import { bindKeyboard, readInput } from "./input.ts";
import { connect, type Net } from "./net.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

const engine = new Engine(canvas, true, { stencil: true }, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.23, 0.48, 1, 1);

// --- Isometric camera: orthographic, fixed angle, follows a target ----------
const ISO_DIST = 30;
const ISO_HEIGHT = ISO_DIST * Math.tan((35.264 * Math.PI) / 180) * Math.SQRT2; // true isometric tilt
const VIEW_SIZE = 9; // half-height of the visible area in metres
const camOffset = new Vector3(-ISO_DIST, ISO_HEIGHT, -ISO_DIST);
const camera = new FreeCamera("iso", camOffset.clone(), scene);
camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
camera.setTarget(Vector3.Zero());
camera.inputs.clear();
const camTarget = Vector3.Zero();

function fitOrtho() {
  const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
  camera.orthoTop = VIEW_SIZE;
  camera.orthoBottom = -VIEW_SIZE;
  camera.orthoLeft = -VIEW_SIZE * aspect;
  camera.orthoRight = VIEW_SIZE * aspect;
}
fitOrtho();

// --- Lights -------------------------------------------------------------------
const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.65;
hemi.groundColor = new Color3(0.35, 0.3, 0.45);
const sun = new DirectionalLight("sun", new Vector3(0.4, -1, 0.6), scene);
sun.position = new Vector3(-20, 40, -30);
sun.intensity = 0.9;
const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;

// --- Greybox level (placeholder until Phase 1/6) ---------------------------------
const mat = (name: string, hex: string) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  return m;
};
const grass = mat("grass", "#4fd27e");
const grassDark = mat("grassDark", "#3fbf6e");
const dirt = mat("dirt", "#c9773a");
const blockMat = mat("block", "#ffd23f");

const TILE = 2;
const HALF = 8;
for (let x = -HALF; x < HALF; x++) {
  for (let z = -HALF; z < HALF; z++) {
    const tile = CreateBox(`t${x}_${z}`, { width: TILE, depth: TILE, height: 1 }, scene);
    tile.position.set(x * TILE + 1, -0.5, z * TILE + 1);
    tile.material = (x + z) % 2 === 0 ? grass : grassDark;
    tile.receiveShadows = true;
    tile.freezeWorldMatrix();
  }
}
const base = CreateBox("base", { width: HALF * 2 * TILE, depth: HALF * 2 * TILE, height: 4 }, scene);
base.position.y = -3;
base.material = dirt;

for (const [x, z, h] of [
  [6, 6, 1],
  [8, 6, 2],
  [-8, 4, 1.5],
  [4, -9, 1],
] as const) {
  const b = CreateBox(`block${x}${z}`, { width: TILE, depth: TILE, height: h }, scene);
  b.position.set(x, h / 2, z);
  b.material = blockMat;
  b.receiveShadows = true;
  shadows.addShadowCaster(b);
}

// --- Crystals -------------------------------------------------------------------
const crystals = ringOfCrystals(10, 6);
const crystalMat = mat("crystal", "#ff2e88");
crystalMat.emissiveColor = Color3.FromHexString("#5a0a2c");
const crystalMeshes = new Map<number, Mesh>();
for (const c of crystals) {
  const m = CreatePolyhedron(`crystal${c.id}`, { type: 1, size: 0.35 }, scene);
  m.scaling.y = 1.6;
  m.position.set(c.pos.x, c.pos.y, c.pos.z);
  m.material = crystalMat;
  shadows.addShadowCaster(m);
  crystalMeshes.set(c.id, m);
}

// --- Players --------------------------------------------------------------------
const heroColors = ["#2f6bff", "#ff8a1f", "#9b4dff", "#ff3b3b"];
function makeHero(color: string): Mesh {
  const m = CreateCapsule("hero", { height: 1.6, radius: 0.45 }, scene);
  m.material = mat(`hero${color}`, color);
  shadows.addShadowCaster(m);
  return m;
}

let local: PlayerSim = createPlayer();
let prev: PlayerSim = local;
const localMesh = makeHero(heroColors[0] ?? "#2f6bff");
const remoteMeshes = new Map<string, Mesh>();
let collected = 0;

// --- Network (optional in Phase 0) ---------------------------------------------
let net: Net | null = null;
$("status").textContent = tr.connecting;
$("hint").textContent = tr.hint;
connect().then((n) => {
  net = n;
  if (!n) $("status").textContent = tr.offline;
});

bindKeyboard(window);
canvas.focus();

// --- Fixed-step loop -------------------------------------------------------------
let acc = 0;
const t0 = Vector3.Zero();
scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.25);
  acc += dt;
  while (acc >= SIM_DT) {
    const input = readInput();
    prev = local;
    local = stepPlayer(local, input);
    net?.sendInput(input);
    for (const id of collectCrystals(local.pos, crystals)) {
      crystalMeshes.get(id)?.dispose();
      collected++;
    }
    acc -= SIM_DT;
  }
  const alpha = acc / SIM_DT;

  if (net) {
    // Phase 0: server positions are shown directly; Phase 2 adds prediction + interpolation.
    const players = net.players();
    $("status").textContent = tr.online(players.size);
    const me = players.get(net.sessionId);
    if (me) {
      local = { ...local, pos: { x: me.x, y: me.y, z: me.z } };
      prev = local;
    }
    for (const [id, p] of players) {
      if (id === net.sessionId) continue;
      let m = remoteMeshes.get(id);
      if (!m) {
        m = makeHero(heroColors[remoteMeshes.size + 1] ?? "#ffffff");
        remoteMeshes.set(id, m);
      }
      m.position.set(p.x, p.y + 0.8, p.z);
    }
    for (const [id, m] of remoteMeshes) {
      if (!players.has(id)) {
        m.dispose();
        remoteMeshes.delete(id);
      }
    }
  }

  const x = prev.pos.x + (local.pos.x - prev.pos.x) * alpha;
  const z = prev.pos.z + (local.pos.z - prev.pos.z) * alpha;
  localMesh.position.set(x, local.pos.y + 0.8, z);

  // Camera follows with smoothing.
  t0.set(x, 0, z);
  Vector3.LerpToRef(camTarget, t0, 1 - 0.0001 ** dt, camTarget);
  camera.position.copyFrom(camTarget).addInPlace(camOffset);

  const spin = performance.now() / 600;
  for (const m of crystalMeshes.values()) if (!m.isDisposed()) m.rotation.y = spin;
  $("crystals").textContent = tr.crystals(collected, crystals.length);
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => {
  engine.resize();
  fitOrtho();
});
