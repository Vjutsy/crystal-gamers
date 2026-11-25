const dict = {
  uk: {
    offline: "Одиночна гра (сервер недоступний)",
    online: (n: number, room: string, ping: number) => `Кімната ${room} · гравців: ${n} · пінг ${ping} мс`,
    connecting: "Підключення до сервера…",
    crystals: (n: number, total: number) => `Кристали: ${n} / ${total}`,
    hint: "WASD / стрілки — рух, Пробіл — стрибок, Shift — спін-деш (тримай і відпусти)",
  },
  en: {
    offline: "Solo play (server unavailable)",
    online: (n: number, room: string, ping: number) => `Room ${room} · players: ${n} · ping ${ping} ms`,
    connecting: "Connecting to server…",
    crystals: (n: number, total: number) => `Crystals: ${n} / ${total}`,
    hint: "WASD / arrows — move, Space — jump, Shift — spin dash (hold and release)",
  },
};

export type Lang = keyof typeof dict;

export const lang: Lang = navigator.language.toLowerCase().startsWith("uk") ? "uk" : "en";
export const tr = dict[lang];
