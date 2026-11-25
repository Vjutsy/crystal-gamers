import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { initPhysics, PhysicsWorld, SIM_DT, testLevel, tuning } from "@cg/shared";
import { maybeShowDebugPanel } from "./debug-panel.ts";
import { capsuleHeight, FEET, HeroView, heroColors } from "./hero-view.ts";
import { tr } from "./i18n.ts";
import { bindKeyboard, readInput } from "./input.ts";
import { buildCheckpoints, buildLevel, makeMaterial } from "./level-view.ts";
import { inviteLink, runLobby } from "./lobby.ts";
import { NetSession, type Session, SoloSession } from "./session.ts";

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

// --- Own hero -----------------------------------------------------------------------
const localHero = new HeroView(scene, shadows, heroColors[0] ?? "#2f6bff");

// Silhouette: a flat-coloured copy drawn only where the hero is hidden behind level geometry
// (depth test GREATER), so the isometric camera never loses the player.
const silhouetteMat = makeMaterial(scene, "silhouette", "#ffffff");
silhouetteMat.disableLighting = true;
silhouetteMat.emissiveColor = Color3.FromHexString("#7fb0ff");
silhouetteMat.alpha = 0.55;
silhouetteMat.depthFunction = Constants.GREATER;
silhouetteMat.disableDepthWrite = true;
const silhouette = localHero.mesh.clone("silhouette");
silhouette.material = silhouetteMat;
silhouette.renderingGroupId = 1;
silhouette.parent = localHero.mesh;
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

/** Other players' heroes (online only), keyed by session id. */
const remoteViews = new Map<string, HeroView>();

$("hint").textContent = tr.hint;
bindKeyboard(window);
canvas.focus();

async function start() {
  await initPhysics();
  const world = new PhysicsWorld(level);
  const checkpointViews = buildCheckpoints(scene, level, shadows);

  const choice = await runLobby();
  const net = choice.kind === "online" ? choice.net : null;
  const session: Session = net ? new NetSession(world, level, net) : new SoloSession(world, level);
  if (net) showInvite(net.roomId);
  else $("status").textContent = tr.solo;
  canvas.focus();
  // For poking at the game from the browser console (and automated checks) in ?debug mode.
  if (new URLSearchParams(location.search).has("debug")) Object.assign(window, { cg: { session, world } });

  let acc = 0;
  const follow = Vector3.Zero();
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.25);
    acc += dt;
    while (acc >= SIM_DT) {
      session.tick(readInput());
      acc -= SIM_DT;
    }
    const f = session.frame(acc / SIM_DT, dt);
    const { x, y, z } = f.me.pos;

    localHero.update(f.me);
    localHero.setColor(heroColors[f.mySlot] ?? "#2f6bff");
    localHero.setName(f.myName);
    localHero.placeLabel(canvas);

    const groundY = world.surfaceBelow({ x, y: y - FEET + 0.05, z }, 12);
    blob.isVisible = groundY !== null;
    if (groundY !== null) {
      const height = y - FEET - groundY;
      const k = Math.max(0.35, 1 - height / 6);
      blob.position.set(x, groundY + 0.02, z);
      blob.scaling.set(k, k, k);
      blobMat.alpha = 0.35 * k;
    }

    // Other players.
    const seen = new Set<string>();
    for (const o of f.others) {
      seen.add(o.id);
      let v = remoteViews.get(o.id);
      if (!v) {
        v = new HeroView(scene, shadows, heroColors[o.slot] ?? "#ffffff");
        remoteViews.set(o.id, v);
      }
      v.setColor(heroColors[o.slot] ?? "#ffffff");
      v.update(o.look);
      v.mesh.visibility *= o.connected ? 1 : 0.4;
      v.setName(o.connected ? o.name : `${o.name} ${tr.disconnected}`);
      v.placeLabel(canvas);
    }
    for (const [id, v] of remoteViews) {
      if (!seen.has(id)) {
        v.dispose();
        remoteViews.delete(id);
      }
    }

    // Camera follows with smoothing.
    follow.set(x, y - capsuleHeight / 2, z);
    Vector3.LerpToRef(camTarget, follow, 1 - 0.0001 ** dt, camTarget);
    camera.position.copyFrom(camTarget).addInPlace(camOffset);

    // Crystals: hide taken ones, sync thrown ones (they blink before vanishing).
    const spin = performance.now() / 600;
    for (const [id, m] of crystalMeshes) {
      m.isVisible = !f.taken(id);
      m.rotation.y = spin;
    }
    const alive = new Set<number>();
    for (const c of f.scattered) {
      alive.add(c.id);
      let m = scatteredMeshes.get(c.id);
      if (!m) {
        m = crystalTemplate.clone(`scattered${c.id}`);
        scatteredMeshes.set(c.id, m);
      }
      m.position.set(c.pos.x, c.pos.y, c.pos.z);
      m.rotation.y = spin * 3;
      m.isVisible = !c.fading || Math.floor(performance.now() / 80) % 2 === 0;
    }
    for (const [id, m] of scatteredMeshes) {
      if (!alive.has(id)) {
        m.dispose();
        scatteredMeshes.delete(id);
      }
    }

    for (const v of checkpointViews) v.setActive(isSamePlace(v.respawn, f.checkpoint));
    $("crystals").textContent = tr.crystals(f.crystals, crystalMeshes.size);
    if (f.status) $("status").textContent = f.status;
  });
}

/** "Copy invite" button in the HUD: the link drops friends straight into this room's lobby. */
function showInvite(code: string) {
  const btn = $("invite") as HTMLButtonElement;
  btn.hidden = false;
  btn.textContent = tr.invite;
  btn.addEventListener("click", async () => {
    btn.blur(); // otherwise Space (jump) would press it again
    canvas.focus();
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      btn.textContent = tr.copied;
    } catch {
      btn.textContent = inviteLink(code);
    }
    setTimeout(() => {
      btn.textContent = tr.invite;
    }, 2000);
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
