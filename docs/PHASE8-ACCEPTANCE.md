# Phase 8 — приёмка (статус)

Viewport эталона: **390×844**. Макеты: `~/Downloads/design-android/png/` (в VM отсутствуют — сверка PNG заблокирована).

## Группы

| Группа | Экраны | Статус |
|---|---|---|
| Tokens / Shell | CSS vars, Tailwind, AppHeader/Leaf/…, bottom nav | совпадает с ТЗ (токены) |
| A | Main/Splash, Login, Register, Pending, Offline, Permissions, AppUpdate | отклонения возможны без PNG |
| B | Home, Prayer, Feed, Profile/More chrome | частичное; без PNG |
| C | Chats list/dialog chrome | частичное (палитра + шапка списка) |
| D | Songbook, Song theme switch | частичное |
| E–G | Service hub, schedules, sermons/resources headers | частичное |
| H–J | Calls / Admin / Push shade | частично (push heads-up chrome) |
| Без макета | см. `MISSING-DESIGN.md` | нет макета |

## Чеклист DOM (после появления макетов)

1. Playwright 390×844: скриншот рядом с `png/<Экран>.png`, допуск ~4 px.
2. Нет горизонтального скролла; overflow текста → ellipsis; кнопки без переноса подписи.
3. Safe-area / клавиатура / нижняя навигация на 360 px.
4. Контраст ≥ WCAG AA; musician theme без чисто белого текста.
5. `npm test` / `tsc` / lint; бандл без макетов.

## Блокер

Загрузить `design-android` в `/workspace/_design-android/` для визуальной сверки.
