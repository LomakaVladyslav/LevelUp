# LevelUp Local Development

Цей runbook описує прямий локальний запуск бекенду і мобільного додатка з
їхніх підпапок. Це основний шлях для Expo Go на фізичному телефоні.

## 1. Бекенд

Відкрий окремий термінал:

```bash
cd /Users/vladyslav/Projects/levelup/levelup-backend
npm install
npm run dev
```

`npm install` потрібно запускати після клонування репозиторію або коли змінився
`package.json` / `package-lock.json`.

Якщо `npm install` падає через peer dependency conflict, тоді повтори
інсталяцію з fallback-прапорцем:

```bash
npm install --legacy-peer-deps
```

Після старту бекенд має бути доступний на порту `3000`.

## 2. Mobile / Expo Go

Відкрий другий термінал:

```bash
cd /Users/vladyslav/Projects/levelup/levelup-mobile
npm install --legacy-peer-deps
npx expo start -c
```

`npm install --legacy-peer-deps` потрібно запускати після клонування репозиторію
або коли змінився `levelup-mobile/package.json` /
`levelup-mobile/package-lock.json`.

`npx expo start -c` стартує Expo з очищенням кешу. Це важливо після змін у
`.env`, залежностях або коли на телефоні був синій екран з помилкою.

## 3. API URL для телефону

Мобільний додаток читає `EXPO_PUBLIC_API_BASE_URL` з
`levelup-mobile/.env`. Для фізичного телефону треба використовувати LAN IP
твого Mac, а не `localhost`.

Отримати поточний Wi-Fi IP:

```bash
ipconfig getifaddr en0
```

Оновити `levelup-mobile/.env`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:3000
```

Не додавай `/api`. Додаток сам нормалізує URL і додає `/api` автоматично.

## 4. Якщо на телефоні синій екран або стара помилка

npx expo start -c --tunnel

1. Зупини Expo в терміналі.
2. Повністю закрий Expo Go на телефоні.
3. Запусти Expo заново:

```bash
cd /Users/vladyslav/Projects/levelup/levelup-mobile
npx expo start -c
```

4. Відкрий Expo Go знову і перескануй QR-код.
5. Якщо помилка пов'язана з мережею, перевір `/health` з браузера телефону.

## 5. Перевірка мережі

У браузері телефона відкрий:

```text
http://YOUR_LAN_IP:3000/health
```

Якщо відповідь не приходить або сторінка не відкривається, телефон не може
достукатися до бекенду. Перевір, що:

- бекенд запущений через `npm run dev`;
- Mac і телефон в одній мережі Wi-Fi;
- у `levelup-mobile/.env` вказаний актуальний LAN IP;
- у URL немає `/api` в кінці.

## 6. Діагностика збереження активності

Коли зберігаєш активність у додатку, дивись у термінал бекенду. Успішний запит
має виглядати приблизно так:

```json
{
  "type": "request",
  "method": "POST",
  "path": "/api/planned-activities",
  "status": 201
}
```

Як інтерпретувати результат:

- Немає backend log: Expo не викликає цей бекенд. Перезапусти Expo через
  `npx expo start -c`, повністю відкрий Expo Go заново і перескануй QR-код.
- `401`: мобільний токен відсутній або протермінований. Вийди з акаунта і
  залогінься знову.
- `500`: запит дійшов до бекенду, але впав серверний код. Дивись помилку в
  backend terminal; найчастіше це база даних, міграції, schema або env config.
- `201`, але додаток все одно показує помилку: створення активності пройшло
  успішно; треба дивитися mobile console на помилку після save.
