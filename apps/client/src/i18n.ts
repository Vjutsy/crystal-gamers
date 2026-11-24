const dict = {
  uk: {
    offline: "Одиночна гра (сервер недоступний)",
    online: (n: number) => `Онлайн: гравців у кімнаті — ${n}`,
    connecting: "Підключення до сервера…",
    crystals: (n: number, total: number) => `Кристали: ${n} / ${total}`,
    hint: "WASD / стрілки — рух",
  },
  en: {
    offline: "Solo play (server unavailable)",
    online: (n: number) => `Online: ${n} player(s) in room`,
    connecting: "Connecting to server…",
    crystals: (n: number, total: number) => `Crystals: ${n} / ${total}`,
    hint: "WASD / arrows — move",
  },
};

export type Lang = keyof typeof dict;

export const lang: Lang = navigator.language.toLowerCase().startsWith("uk") ? "uk" : "en";
export const tr = dict[lang];
