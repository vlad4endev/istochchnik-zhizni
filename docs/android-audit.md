# Аудит Android-приложения (14.10.2026)

В репозитории **три** Android-кодовые базы. Продуктивной считается только первая.

| Папка | Стек | Состояние |
|---|---|---|
| `web-react/android` | Capacitor 7 (WebView поверх web-react), FCM, нативные звонки (Java) | Единственная с пушами и CallStyle-звонками. **Сборка сломана** (см. ниже). Дизайн — старый (PWA). |
| `mobile/` | Expo 56 / React Native 0.85 (новое нативное приложение под макеты) | 19 экранов из 82 макетов, старая палитра, нет нативной папки/CI. `tsc` чистый. |
| `android-app/` | React Native + WatermelonDB (офлайн-first MVP) | Заброшен: 3 экрана, не связан с макетами. |

## Макеты (артефакт «Моя церковь — Android»)

82 артборда 390×844. Язык: бордовый градиент `#230810 → #8A2342` + зерно, кремовая «шторка» `#FBF6EF`
со скруглением 30–36 px, акцент янтарь `#F2B879`, текст `#3A1018`, вторичный `#6A5555`,
заголовки Onest 800, акцентные курсивные заголовки Playfair Display, тёмный стеклянный таб-бар
(Главная · Молитва · Лента · Чаты · Ещё) с «пилюлей» активной вкладки и FAB.

## Что не так в `mobile/`

**Дизайн**
- Палитра `#7d3640`/`#f4f1ed` из PWA, а не из макетов; нет градиентной шапки, зерна, шторки.
- Иконки Ionicons вместо линейных иконок макета; нет шрифтов Onest/Playfair (системный шрифт).
- Таб-бар стандартный светлый, вкладки другие (Песенник/Проповеди/Настройки вместо Лента/Ещё).
- Нет `expo-linear-gradient`, `react-native-svg`, `expo-font`.

**Логика / сборка**
- URL API по умолчанию `http://10.0.2.2:40978` (хост эмулятора) — в реальном APK приложение не достучится
  до сервера, пока пользователь вручную не введёт адрес в настройках.
- Нет `eas.json`, CI-workflow и подписи релиза; нет пушей (`expo-notifications`) и звонков (LiveKit).
- Нет `Register`, `Feed`, `More`, `Profile`, `Offline`, `Permissions` и ещё ~60 экранов.

### Покрытие макетов экранами

Есть (19): Login(Main/Dark), Pending, Home, Chats, Dialog, NewChat, Prayer, PrayerCyclePlan, Songbook, Song,
Sermons, Settings, Events, Schedule (media), ServiceHub/Editor, Studio (Catalog/Setlists/SetlistDetail/Perform).

Нет (≈63): Register, Feed, More, Profile, PublicProfile, StoryCompose, Offline, Permissions, AppUpdate,
Broadcast, IncomingCall, InCall, CreateMeeting, NeedsSheet, PrayerViewers, MySermons, SermonEditor, Resources,
чат (NewGroup, DialogPoll, PollCreate, MessageActions, Forward, Readers, ChatInfo, ChatMembers, ChatPerms,
ChatMedia), Admin* (12), песни (AddSong, SongSettings, SongPicker, SongUsage), студия (Tags, Instruments),
расписание (ScheduleHub, MySchedule, SundaySchedule, MusicSchedule, MemberPicker, RolesSettings, CreateEvent),
программа (ServiceEditor2, ServiceSettings, BlockEdit, BlockEdit2, BlockMenu), PublicSetlist.
`PushShade`/`PushHeadsUp` — нативные уведомления Android, не экраны.

## Что не так в `web-react/android` (Capacitor)

- `styles.xml` ссылается на `@color/colorPrimary|colorPrimaryDark|colorAccent`, а `values/colors.xml` не существует
  (и никогда не коммитился) → `aapt2 link` падает, APK не собрать.
- Название приложения «Молитва» (в макетах «Моя церковь»); `android:allowBackup=false` ок.
- `android:apk` собирает только `assembleDebug`; release без signingConfig; `versionCode` правится вручную.
- Нет CI на сборку APK.

## Ограничения этой среды

Android SDK недоступен (`dl.google.com` блокируется прокси), поэтому APK здесь собрать нельзя.
Проверка — `tsc`, тесты, web-экспорт для скриншотов; APK собирается в GitHub Actions.

## Что сделано (обновление)

Выбран путь «Capacitor + web-react»: экраны и логика те же, что в PWA, меняется только оформление.
Новый дизайн включается классом `html.app-android-native` (только Capacitor/Android, см.
`web-react/src/lib/androidNativeTheme.ts`); стили и шрифты Onest/Playfair лежат в отдельном чанке и в PWA не грузятся.

- Исправлена сборка: добавлен `values/colors.xml`; приложение называется «Моя церковь».
- Оформление (`web-react/src/styles/androidNative.css`): палитра, шрифт, градиентная шапка с кремовой шторкой,
  тёмный таб-бар, список чатов и диалог, лента, настройки, расписания, мероприятия, админка, студия,
  чтение песни (тёмный режим), конспект проповеди, звонки, вход и «нет соединения».
- CI: `.github/workflows/android-apk.yml` собирает debug APK.
- `mobile/` (Expo) и `android-app/` (RN) не используются для Android-релиза и не менялись.

Добавлено позже: форма входа с бордовой шапкой, компактная карточка профиля, шторка «Ещё» и плитки звонка в палитре макетов.
Эти изменения только в Android-режиме; в PWA разметка не меняется (добавлены лишь классы-крючки).

Не сделано: публичные страницы (профиль в шапке без градиента, сетлист) и проверка конструктора службы.
