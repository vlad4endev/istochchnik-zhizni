# Phase 8 — приёмка (статус)

Viewport эталона: **390×844**. Макеты: commit `8d7b301…/mobile` (`*.dc.html`), копия в `/workspace/_design-android/screens/` и `/tmp/mobile/`.

## Группы

| Группа | Экраны | Статус |
|---|---|---|
| Tokens / Shell | CSS vars, Tailwind, AppHeader/Leaf, **тёмная стеклянная нижняя навигация** (gold pill) | совпадает с Home/More |
| A | **Main** (AuthLanding: фото + Playfair CTA), Login, Splash, Offline, Permissions, AppUpdate | Main по макету |
| B | Home, Prayer, Feed, **More** (плитки 3×N + списки Админ/Профиль/Выход) | More по макету |
| C | **Chats** (тёмная шапка, gold compose, wine chips), Dialog, MessageActions (cream reaction bar) | совпадает с Chats/MessageActions |
| D | Songbook, **Song** stage chrome (key badge gold, dark toolbar) | частичное / Song chrome |
| E–G | **ServiceHub** create card (#F4E6E4), schedules, sermons headers | ServiceHub create card |
| H–J | **Admin hub** (поиск + list rows на mobile), Calls / Push | Admin hub по макету |
| Без макета | см. `MISSING-DESIGN.md` | нет макета |

## Чеклист DOM

1. Playwright 390×844: скриншот рядом с `png/<Экран>.png`, допуск ~4 px (PNG в VM по-прежнему мало).
2. Нет горизонтального скролла; overflow текста → ellipsis.
3. Safe-area / клавиатура / нижняя навигация на 360 px.
4. Контраст ≥ WCAG AA; musician theme без чисто белого текста.
5. `npm test` / `tsc` / lint; бандл без макетов (`_design-android/` gitignored).
