import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import {
  createGame,
  type HeroState,
  initPhysics,
  type MoverState,
  PhysicsWorld,
  SIM_DT,
  stepGame,
  testLevel,
  tuning,
} from "@cg/shared";
import { maybeShowDebugPanel } from "./debug-panel.ts";
import { tr } from "./i18n.ts";
import { bindKeyboard, readInput } from "./input.ts";
import { buildCheckpoints, buildLevel, makeMaterial } from "./level-view.ts";
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
const shadows = new ShadowGenerator(2048, sun);
shadows.useBlurExponentialShadowMap = true;

// --- Level: one data source for visuals and physics ------------------------------
const level = testLevel;
buildLevel(scene, level, shadows);

// --- Crystals ---------------------------------------------------------------------
const crystalMat = makeMaterial(scene, "crystal", "#ff2e88");
crystalMat.emissiveColor = Color3.FromHexString("#5a0a2c");
const crystalTemplate = CreatePolyhedron("crystal", { type: 1, size: 0.35 }, scene);
crystalTemplate.scaling.y = 1.6;
crystalTemplate.material = crystalMat;
crystalTemplate.isVisible = false;
const crystalMeshes = new Map<number, Mesh>();
(level.crystals ?? []).forEach((pos, id) => {
  const m = crystalTemplate.clone(`crystal${id}`);
  m.isVisible = true;
  m.position.set(pos.x, pos.y, pos.z);
  shadows.addShadowCaster(m);
  crystalMeshes.set(id, m);
});
/** Meshes for crystals thrown out by hits, keyed by scattered id. */
const scatteredMeshes = new Map<number, Mesh>();

// --- Heroes -----------------------------------------------------------------------
const heroColors = ["#2f6bff", "#ff8a1f", "#9b4dff", "#ff3b3b"];
const capsuleHeight = 2 * (tuning.capsule.halfHeight + tuning.capsule.radius);
function makeHero(color: string): Mesh {
  const m = CreateCapsule("hero", { height: capsuleHeight, radius: tuning.capsule.radius }, scene);
  m.material = makeMaterial(scene, `hero${color}`, color);
  shadows.addShadowCaster(m);
  return m;
}

const localMesh = makeHero(heroColors[0] ?? "#2f6bff");

// Silhouette: a flat-coloured copy drawn only where the hero is hidden behind level geometry
// (depth test GREATER), so the isometric camera never loses the player.
const silhouetteMat = makeMaterial(scene, "silhouette", "#ffffff");
silhouetteMat.disableLighting = true;
silhouetteMat.emissiveColor = Color3.FromHexString("#7fb0ff");
silhouetteMat.alpha = 0.55;
silhouetteMat.depthFunction = Constants.GREATER;
silhouetteMat.disableDepthWrite = true;
const silhouette = localMesh.clone("silhouette");
silhouette.material = silhouetteMat;
silhouette.renderingGroupId = 1;
silhouette.parent = localMesh;
silhouette.position.set(0, 0, 0);
// Keep group 0's depth buffer when drawing group 1, otherwise GREATER has nothing to compare with.
scene.setRenderingAutoClearDepthStencil(1, false, false, false);

// Blob shadow: in an isometric view it is the main cue for how high the hero is.
const blob = CreateDisc("blob", { radius: tuning.capsule.radius * 1.1, tessellation: 24 }, scene);
blob.rotation.x = Math.PI / 2;
const blobMat = makeMaterial(scene, "blob", "#000000");
blobMat.alpha = 0.35;
blobMat.disableLighting = true;
blob.material = blobMat;
const FEET = tuning.capsule.halfHeight + tuning.capsule.radius;
const remoteMeshes = new Map<string, Mesh>();
const ME = "me";

$("status").textContent = tr.connecting;
$("hint").textContent = tr.hint;
bindKeyboard(window);
canvas.focus();

async function start() {
  await initPhysics();
  const world = new PhysicsWorld(level);
  const game = createGame(world, level, [ME]);
  const hero = () => game.heroes[ME] as HeroState;
  let prev: MoverState = hero().mover;
  const checkpointViews = buildCheckpoints(scene, level, shadows);

  const net: Net | null = await connect();
  if (!net) $("status").textContent = tr.offline;

  let acc = 0;
  const follow = Vector3.Zero();
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.25);
    acc += dt;
    while (acc >= SIM_DT) {
      const input = readInput();
      prev = hero().mover;
      stepGame(world, game, { [ME]: input }, SIM_DT);
      net?.sendInput(input);
      acc -= SIM_DT;
    }
    const alpha = acc / SIM_DT;
    const h = hero();

    if (net) {
      // Phase 1: the server position wins outright; Phase 2 adds prediction + reconciliation.
      const players = net.players();
      $("status").textContent = tr.online(players.size);
      const me = players.get(net.sessionId);
      if (me) {
        h.mover = { ...h.mover, pos: { x: me.x, y: me.y, z: me.z } };
        prev = h.mover;
      }
      for (const [id, p] of players) {
        if (id === net.sessionId) continue;
        let m = remoteMeshes.get(id);
        if (!m) {
          m = makeHero(heroColors[remoteMeshes.size + 1] ?? "#ffffff");
          remoteMeshes.set(id, m);
        }
        m.position.set(p.x, p.y, p.z);
      }
      for (const [id, m] of remoteMeshes) {
        if (!players.has(id)) {
          m.dispose();
          remoteMeshes.delete(id);
        }
      }
    }

    const mover = h.mover;
    const x = prev.pos.x + (mover.pos.x - prev.pos.x) * alpha;
    const y = prev.pos.y + (mover.pos.y - prev.pos.y) * alpha;
    const z = prev.pos.z + (mover.pos.z - prev.pos.z) * alpha;
    localMesh.position.set(x, y, z);

    // Look: squash while charging, ball while rolling, lying grey when downed, blinking when hurt.
    const glow = localMesh.material as StandardMaterial;
    localMesh.rotation.set(0, 0, 0);
    if (h.downed > 0) {
      localMesh.scaling.set(1, 1, 1);
      localMesh.rotation.z = Math.PI / 2;
      localMesh.position.y = y - FEET + tuning.capsule.radius;
      glow.emissiveColor.set(0, 0, 0);
    } else if (mover.spinCharge >= 0) {
      const lvl = Math.min(3, 1 + Math.floor(mover.spinCharge / tuning.spinDash.levelTime));
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (120 - lvl * 25));
      localMesh.scaling.set(1.15, 0.7, 1.15);
      glow.emissiveColor.set(0.15 * lvl * pulse, 0.25 * lvl * pulse, 0.6 * lvl * pulse);
    } else if (mover.rolling) {
      localMesh.scaling.set(1.05, 0.55, 1.05);
      glow.emissiveColor.set(0.1, 0.35, 0.9);
    } else {
      localMesh.scaling.set(1, 1, 1);
      glow.emissiveColor.set(0, 0, 0);
    }
    if (h.downed <= 0) localMesh.position.y -= ((1 - localMesh.scaling.y) * capsuleHeight) / 2;
    localMesh.visibility = h.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0 ? 0.25 : 1;

    const groundY = world.surfaceBelow({ x, y: y - FEET + 0.05, z }, 12);
    blob.isVisible = groundY !== null;
    if (groundY !== null) {
      const height = y - FEET - groundY;
      const k = Math.max(0.35, 1 - height / 6);
      blob.position.set(x, groundY + 0.02, z);
      blob.scaling.set(k, k, k);
      blobMat.alpha = 0.35 * k;
    }

    // Camera follows with smoothing.
    follow.set(x, y - capsuleHeight / 2, z);
    Vector3.LerpToRef(camTarget, follow, 1 - 0.0001 ** dt, camTarget);
    camera.position.copyFrom(camTarget).addInPlace(camOffset);

    // Crystals: hide taken ones, sync thrown ones (they blink before vanishing).
    const spin = performance.now() / 600;
    for (const c of game.crystals) {
      const m = crystalMeshes.get(c.id);
      if (!m) continue;
      m.isVisible = !c.taken;
      m.rotation.y = spin;
    }
    const alive = new Set<number>();
    for (const c of game.scattered) {
      alive.add(c.id);
      let m = scatteredMeshes.get(c.id);
      if (!m) {
        m = crystalTemplate.clone(`scattered${c.id}`);
        scatteredMeshes.set(c.id, m);
      }
      m.position.set(c.pos.x, c.pos.y, c.pos.z);
      m.rotation.y = spin * 3;
      const fading = c.age > tuning.scatter.life - 1;
      m.isVisible = !fading || Math.floor(performance.now() / 80) % 2 === 0;
    }
    for (const [id, m] of scatteredMeshes) {
      if (!alive.has(id)) {
        m.dispose();
        scatteredMeshes.delete(id);
      }
    }

    for (const v of checkpointViews) v.setActive(isSamePlace(v.respawn, h.checkpoint));
    $("crystals").textContent = tr.crystals(h.crystals, game.crystals.length);
  });
}

function isSamePlace(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
}

maybeShowDebugPanel();
start();
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => {
  engine.resize();
  fitOrtho();
});
