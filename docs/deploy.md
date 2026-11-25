# Деплой

## Клієнт — GitHub Pages

Збирається й публікується автоматично з `main` (`.github/workflows/deploy-client.yml`).
Адреса сервера записана в `apps/client/src/net.ts` (`HOSTED_SERVER_URL` = `wss://crystal-gamers-server.onrender.com`).
Її можна перевизначити змінною репозиторію `SERVER_URL` (Settings → Secrets and variables → Actions → Variables).
На `localhost` клієнт завжди йде на локальний сервер.

## Сервер — Render Free

Описаний у `render.yaml` (Blueprint). Перше налаштування (один раз):

1. Зайти на render.com через GitHub-акаунт.
2. New → Blueprint → вибрати репозиторій `crystal-gamers` → Apply.
3. Дочекатися деплою, відкрити `https://<назва>.onrender.com/health` — має бути `{"ok":true,...}`.
4. Якщо адреса інша — оновити `HOSTED_SERVER_URL` у `apps/client/src/net.ts`.

Зараз Blueprint підключено як **публічний репозиторій** (застосунок Render на GitHub встановити не вдалося), тому після змін у сервері треба натиснути **Manual Deploy → Deploy latest commit** на сторінці сервісу в Render.

Коли GitHub-акаунт буде підключено до Render, сервер оновлюватиметься сам після злиття в `main` (якщо змінилися `apps/server`, `packages/shared` чи lock-файл).

## Перевірка навантаження

```
pnpm --filter @cg/server bench                         # локально
pnpm --filter @cg/server bench wss://<назва>.onrender.com 30   # на хостингу
```
4 боти бігають 30 с, потім показується час тіку з `/health`: `avgMs`, `p99Ms`, `maxMs`.
Бюджет — 16.7 мс на тік (60 Гц); `p99Ms` має бути значно менше.

Безкоштовний план засинає після ~15 хв без відвідувачів і прокидається до хвилини — лобі показує це гравцям.
