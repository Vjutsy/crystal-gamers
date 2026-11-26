const dict = {
  uk: {
    solo: "Одиночна гра",
    online: (n: number, room: string, ping: number) => `Кімната ${room} · гравців: ${n} · пінг ${ping} мс`,
    crystals: (n: number, total: number) => `Кристали: ${n} / ${total}`,
    hint: "WASD / стрілки — рух, Пробіл — стрибок (ще раз у повітрі — прийом героя), Shift — спін-деш (тримай і відпусти), E — підняти друга",
    invite: "Скопіювати запрошення",
    disconnected: "(зв'язок втрачено)",
    copied: "Посилання скопійовано ✓",
    lobby: {
      name: "Нікнейм",
      namePlaceholder: "Як тебе звати?",
      create: "Створити кімнату",
      or: "або зайти за кодом",
      join: "Приєднатися",
      solo: "Грати соло",
      connecting: "Підключення…",
      waking: (s: number) => `Сервер прокидається (безкоштовний хостинг спить, до хвилини)… ${s} с`,
      errors: {
        badCode: "Код — це 4 символи, наприклад K7QM.",
        "not-found": "Такої кімнати немає. Перевір код або створи нову.",
        full: "Кімната заповнена (максимум 4 гравці).",
        unreachable: "Не вдалося достукатися до сервера. Спробуй ще раз або грай соло.",
        "hero-taken": "Цього героя щойно взяв хтось інший — обери іншого.",
      },
    },
    picker: {
      title: "Обери героя",
      play: "Грати",
      back: "Назад",
      takenBy: (name: string) => `зайнято: ${name}`,
      stats: { speed: "Швидкість", accel: "Розгін", jump: "Стрибок", stability: "Стійкість" },
      tricks: {
        none: "",
        pound: "Пробіл у повітрі — удар об землю",
        doubleJump: "Пробіл у повітрі — подвійний стрибок",
        airDash: "Пробіл у повітрі — ривок",
        ramSpin: "Спін-деш — таран",
      },
    },
  },
  en: {
    solo: "Solo play",
    online: (n: number, room: string, ping: number) => `Room ${room} · players: ${n} · ping ${ping} ms`,
    crystals: (n: number, total: number) => `Crystals: ${n} / ${total}`,
    hint: "WASD / arrows — move, Space — jump (again in the air — hero trick), Shift — spin dash (hold and release), E — revive a friend",
    invite: "Copy invite link",
    disconnected: "(connection lost)",
    copied: "Link copied ✓",
    lobby: {
      name: "Nickname",
      namePlaceholder: "What's your name?",
      create: "Create room",
      or: "or join by code",
      join: "Join",
      solo: "Play solo",
      connecting: "Connecting…",
      waking: (s: number) => `Server is waking up (free hosting sleeps, up to a minute)… ${s} s`,
      errors: {
        badCode: "A code is 4 characters, e.g. K7QM.",
        "not-found": "No such room. Check the code or create a new one.",
        full: "The room is full (4 players max).",
        unreachable: "Could not reach the server. Try again or play solo.",
        "hero-taken": "Someone just took this hero — pick another one.",
      },
    },
    picker: {
      title: "Choose your hero",
      play: "Play",
      back: "Back",
      takenBy: (name: string) => `taken: ${name}`,
      stats: { speed: "Speed", accel: "Acceleration", jump: "Jump", stability: "Stability" },
      tricks: {
        none: "",
        pound: "Space in the air — ground slam",
        doubleJump: "Space in the air — double jump",
        airDash: "Space in the air — dash",
        ramSpin: "Spin dash — battering ram",
      },
    },
  },
};

export type Lang = keyof typeof dict;

export const lang: Lang = navigator.language.toLowerCase().startsWith("uk") ? "uk" : "en";
export const tr = dict[lang];
