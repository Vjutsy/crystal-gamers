import { normalizeRoomCode } from "@cg/shared";
import { tr } from "./i18n.ts";
import {
  connect,
  JoinFailed,
  type JoinRequest,
  type Net,
  reconnect,
  savedSeat,
  serverUrl,
  wakeServer,
} from "./net.ts";

export type LobbyChoice = { kind: "solo" } | { kind: "online"; net: Net };

const NAME_KEY = "cg-name";

function savedName(): string {
  const fromUrl = new URLSearchParams(location.search).get("name");
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not critical.
  }
}

/** Link other players open to land in this room. Keeps test params like ?debug or ?lag. */
export function inviteLink(code: string): string {
  const url = new URL(location.href);
  url.searchParams.delete("name");
  url.searchParams.set("room", code);
  return url.toString();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  return node;
}

/**
 * Start screen: nickname, create a room or join by code (prefilled from ?room=CODE), or solo.
 * Without a configured server it goes straight to solo play.
 */
export async function runLobby(): Promise<LobbyChoice> {
  const url = serverUrl();
  if (!url) return { kind: "solo" };

  // Came back within the grace period (reload, reopened tab or link): take our own seat back.
  const code = normalizeRoomCode(new URLSearchParams(location.search).get("room") ?? "");
  const seat = code ? savedSeat(code) : null;
  if (seat) {
    const net = await reconnect(url, seat.token);
    if (net) return { kind: "online", net };
  }
  return showLobby(url);
}

function showLobby(url: string): Promise<LobbyChoice> {
  return new Promise((resolve) => {
    const box = el("div", { id: "lobby" });
    const card = el("form", { className: "card" });
    const title = el("h1", { textContent: "Crystal Gamers" });
    const nameLabel = el("label", { textContent: tr.lobby.name });
    const name = el("input", { value: savedName(), maxLength: 16, placeholder: tr.lobby.namePlaceholder });
    nameLabel.append(name);

    const create = el("button", { type: "button", textContent: tr.lobby.create });
    const codeRow = el("div", { className: "row" });
    const code = el("input", {
      value: new URLSearchParams(location.search).get("room") ?? "",
      maxLength: 4,
      placeholder: "ABCD",
      className: "code",
    });
    const join = el("button", { type: "submit", textContent: tr.lobby.join });
    codeRow.append(code, join);
    const solo = el("button", { type: "button", textContent: tr.lobby.solo, className: "quiet" });
    const message = el("p", { className: "message" });

    card.append(
      title,
      nameLabel,
      create,
      el("p", { className: "or", textContent: tr.lobby.or }),
      codeRow,
      solo,
      message,
    );
    box.append(card);
    document.body.append(box);
    (code.value ? join : name).focus();

    const buttons = [create, join, solo];
    const busy = (on: boolean) => {
      for (const b of buttons) b.disabled = on;
    };
    const finish = (choice: LobbyChoice) => {
      box.remove();
      resolve(choice);
    };

    async function go(req: JoinRequest) {
      const nick = name.value.trim();
      if (nick) saveName(nick);
      busy(true);
      message.className = "message";
      message.textContent = tr.lobby.connecting;
      let tick: ReturnType<typeof setInterval> | undefined;
      const t0 = performance.now();
      const awake = await wakeServer(url, () => {
        const show = () => {
          message.textContent = tr.lobby.waking(Math.round((performance.now() - t0) / 1000));
        };
        show();
        tick = setInterval(show, 1000);
      });
      clearInterval(tick);
      if (!awake) return fail(tr.lobby.errors.unreachable);
      message.textContent = tr.lobby.connecting;
      try {
        const net = await connect(url, req, nick);
        history.replaceState(null, "", inviteLink(net.roomId));
        finish({ kind: "online", net });
      } catch (err) {
        const reason = err instanceof JoinFailed ? err.reason : "unreachable";
        fail(tr.lobby.errors[reason]);
      }
    }

    function fail(text: string) {
      busy(false);
      message.className = "message error";
      message.textContent = text;
    }

    create.addEventListener("click", () => go({ mode: "create" }));
    card.addEventListener("submit", (e) => {
      e.preventDefault();
      const c = normalizeRoomCode(code.value);
      if (!c) {
        fail(tr.lobby.errors.badCode);
        code.focus();
        return;
      }
      go({ mode: "join", code: c });
    });
    solo.addEventListener("click", () => finish({ kind: "solo" }));
  });
}
