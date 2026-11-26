import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { type HeroId, heroes, standHeight, tuning, type Vec3 } from "@cg/shared";
import { makeMaterial } from "./level-view.ts";

/** Feet-to-centre distance of a hero's capsule. */
export function heroFeet(hero: HeroId): number {
  return standHeight({ capsule: heroes[hero].capsule });
}

/** Everything needed to draw one hero for one frame. */
export interface HeroLook {
  pos: Vec3;
  spinCharge: number;
  rolling: boolean;
  downed: number;
  invuln: number;
}

const labelLayer = document.getElementById("labels") as HTMLElement;

/** A hero capsule with its pose effects and an optional nickname above the head. */
export class HeroView {
  readonly mesh: Mesh;
  private mat: StandardMaterial;
  private label: HTMLDivElement | null = null;
  private readonly height: number;
  private readonly radius: number;

  constructor(
    private scene: Scene,
    shadows: ShadowGenerator,
    readonly hero: HeroId,
  ) {
    const def = heroes[hero];
    this.radius = def.lookRadius ?? def.capsule.radius;
    this.height = 2 * heroFeet(hero);
    this.mesh = CreateCapsule("hero", { height: this.height, radius: this.radius }, scene);
    this.mat = makeMaterial(scene, `hero-${hero}`, def.color);
    this.mesh.material = this.mat;
    shadows.addShadowCaster(this.mesh);
  }

  setName(name: string | null) {
    if (!name) {
      this.label?.remove();
      this.label = null;
      return;
    }
    if (!this.label) {
      this.label = document.createElement("div");
      this.label.className = "nick";
      labelLayer.appendChild(this.label);
    }
    if (this.label.textContent !== name) this.label.textContent = name;
  }

  /** Squash while charging, ball while rolling, lying when downed, blinking when hurt. */
  update(look: HeroLook) {
    const { pos } = look;
    const m = this.mesh;
    m.position.set(pos.x, pos.y, pos.z);
    m.rotation.set(0, 0, 0);
    const glow = this.mat.emissiveColor;
    if (look.downed > 0) {
      m.scaling.set(1, 1, 1);
      m.rotation.z = Math.PI / 2;
      m.position.y = pos.y - this.height / 2 + this.radius;
      glow.set(0, 0, 0);
    } else if (look.spinCharge >= 0) {
      const lvl = Math.min(3, 1 + Math.floor(look.spinCharge / tuning.spinDash.levelTime));
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (120 - lvl * 25));
      m.scaling.set(1.15, 0.7, 1.15);
      glow.set(0.15 * lvl * pulse, 0.25 * lvl * pulse, 0.6 * lvl * pulse);
    } else if (look.rolling) {
      m.scaling.set(1.05, 0.55, 1.05);
      glow.set(0.1, 0.35, 0.9);
    } else {
      m.scaling.set(1, 1, 1);
      glow.set(0, 0, 0);
    }
    if (look.downed <= 0) m.position.y -= ((1 - m.scaling.y) * this.height) / 2;
    m.visibility = look.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0 ? 0.25 : 1;
  }

  /** Places the nickname above the head in screen space (CSS pixels). */
  placeLabel(canvas: HTMLCanvasElement) {
    if (!this.label) return;
    const head = this.mesh.position.add(new Vector3(0, this.height / 2 + 0.35, 0));
    const p = Vector3.Project(
      head,
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      new Viewport(0, 0, canvas.clientWidth, canvas.clientHeight),
    );
    this.label.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  dispose() {
    this.setName(null);
    this.mesh.dispose();
    this.mat.dispose();
  }
}
