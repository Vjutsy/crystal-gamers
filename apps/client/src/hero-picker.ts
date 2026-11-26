import { HERO_IDS, type HeroId, type HeroStat, heroes, heroStats, isHeroId } from "@cg/shared";
import { tr } from "./i18n.ts";

export interface Taken {
  hero: string;
  name: string;
}

const HERO_KEY = "cg-hero";
const STATS: HeroStat[] = ["speed", "accel", "jump", "stability"];

/** 1..5 dots per stat, relative to the other heroes. */
function dots(hero: HeroId, stat: HeroStat): number {
  const all = HERO_IDS.map((h) => heroStats(h)[stat]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const v = heroStats(hero)[stat];
  return hi === lo ? 3 : 1 + Math.round(((v - lo) / (hi - lo)) * 4);
}

/** Grey silhouette in the hero's proportions (greybox until Phase 6 art). */
function silhouette(hero: HeroId): SVGSVGElement {
  const def = heroes[hero];
  const r = def.lookRadius ?? def.capsule.radius;
  const h = 2 * (def.capsule.halfHeight + def.capsule.radius);
  const scale = 40; // px per metre; the tallest hero (2.4 m) fits 100 px
  const w = 2 * r * scale;
  const hh = h * scale;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 60 100");
  svg.setAttribute("class", "silhouette");
  const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  body.setAttribute("x", String(30 - w / 2));
  body.setAttribute("y", String(100 - hh));
  body.setAttribute("width", String(w));
  body.setAttribute("height", String(hh));
  body.setAttribute("rx", String(w / 2));
  body.setAttribute("fill", def.color);
  svg.append(body);
  return svg;
}

function lastHero(): HeroId | null {
  try {
    const v = localStorage.getItem(HERO_KEY);
    return isHeroId(v) ? v : null;
  } catch {
    return null;
  }
}

function rememberHero(hero: HeroId) {
  try {
    localStorage.setItem(HERO_KEY, hero);
  } catch {
    // not critical
  }
}

/**
 * Four hero cards; taken ones are greyed out with the player's nickname.
 * Resolves with the chosen hero, or null for "back".
 */
export function pickHero(container: HTMLElement, taken: Taken[], message = ""): Promise<HeroId | null> {
  return new Promise((resolve) => {
    container.replaceChildren();
    const takenBy = new Map(taken.map((t) => [t.hero, t.name]));
    const free = HERO_IDS.filter((h) => !takenBy.has(h));
    let chosen: HeroId | null = [lastHero(), ...free].find((h) => h !== null && free.includes(h)) ?? null;

    const title = document.createElement("h2");
    title.textContent = tr.picker.title;
    const grid = document.createElement("div");
    grid.className = "heroes";
    const cards = new Map<HeroId, HTMLButtonElement>();

    for (const id of HERO_IDS) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "hero";
      card.style.setProperty("--hero", heroes[id].color);
      const name = document.createElement("strong");
      name.textContent = heroes[id].name;
      const stats = document.createElement("dl");
      for (const s of STATS) {
        const dt = document.createElement("dt");
        dt.textContent = tr.picker.stats[s];
        const dd = document.createElement("dd");
        dd.textContent = "●".repeat(dots(id, s)) + "○".repeat(5 - dots(id, s));
        stats.append(dt, dd);
      }
      card.append(silhouette(id), name, stats);
      const by = takenBy.get(id);
      if (by !== undefined) {
        card.disabled = true;
        card.classList.add("taken");
        const note = document.createElement("small");
        note.textContent = tr.picker.takenBy(by);
        card.append(note);
      }
      card.addEventListener("click", () => select(id));
      card.addEventListener("dblclick", () => {
        select(id);
        done(id);
      });
      cards.set(id, card);
      grid.append(card);
    }

    const row = document.createElement("div");
    row.className = "row";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "quiet";
    back.textContent = tr.picker.back;
    const play = document.createElement("button");
    play.type = "button";
    play.textContent = tr.picker.play;
    row.append(back, play);
    const msg = document.createElement("p");
    msg.className = message ? "message error" : "message";
    msg.textContent = message;
    container.append(title, grid, row, msg);

    function select(id: HeroId) {
      chosen = id;
      for (const [h, c] of cards) c.classList.toggle("chosen", h === id);
      play.disabled = false;
    }
    if (chosen) select(chosen);
    else play.disabled = true;
    play.focus();

    function done(value: HeroId | null) {
      if (value) rememberHero(value);
      resolve(value);
    }
    back.addEventListener("click", () => done(null));
    play.addEventListener("click", () => {
      if (chosen) done(chosen);
    });
  });
}
