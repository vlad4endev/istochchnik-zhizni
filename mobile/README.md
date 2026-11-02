# Дизайн Android-приложения «Моя церковь»

screens/*.dc.html — исходники экранов (чистый HTML + inline-стили, 390×844). Открывать в браузере или читать как спецификацию.
png/*.png — снимки каждого экрана (ориентир для визуальной сверки).

## Токены
Шрифты: Onest (400–800) для интерфейса; Playfair Display italic — акцентные фразы.
Светлая тема: фон лист #FBF6EF, карточки #fff (radius 18–20), ink #3A1018, muted #6A5555,
 акцент вино #8A2742 → градиент кнопки #8A2742→#5A1826, золото #F2B879, фон шапки #230810 + размытые круги #8A2342/#F0A25A.
Тема музыканта (песня, сетлисты, выступление): фон #0B0B0D, карточки #151518/#1E1E22, текст #E9E5DD, muted #938E86, акцент #E8B35F, граница rgba(255,255,255,.07).
Шапка: компактная, заголовок 23px/800, кнопки 36px, лист поднимается на 84–92px.
Нижняя навигация: Главная / Молитва / Лента / Чаты / Ещё, высота 84, активный пункт — золотая «пилюля».

## Соответствие экранов и веб-роутов (web-react/src)
Home→/dashboard · Prayer→/prayer · Feed→/feed · Chats, Dialog, NewChat, NewGroup, DialogPoll, PollCreate, MessageActions, Forward, Readers, ChatInfo, ChatMembers, ChatPerms, ChatMedia→/messenger/*
Songbook, Song, SongSettings, AddSong→/songbook/* · Setlists, SetlistDetail, Perform, PublicSetlist→/songbook/setlists, /setlist-share/:token
StudioCatalog, StudioTags, StudioInstruments, SongUsage→/studio/*
ServiceHub, ServiceEditor, ServiceEditor2, ServiceSettings, BlockEdit, BlockEdit2, BlockMenu, SongPicker, MemberPicker→/service-planner
Schedule, ScheduleHub, MySchedule, SundaySchedule, MusicSchedule, RolesSettings→/schedules/*
Events, CreateEvent→календарь · Sermons, MySermons, SermonEditor→/sermons, /my-sermons · Resources→/resources
Broadcast, IncomingCall, InCall, CreateMeeting→/broadcast, /call/:id · Profile, PublicProfile, Settings→/profile, /settings
Admin, AdminPeople, MemberCard, AdminRequests, AdminPrayer, AdminNotify, AdminTelegram, AdminBackup, AdminRoles, AdminSections, AdminReleases, AdminJournal→/admin
Login, Register, Pending, Offline, Permissions, AppUpdate→вход и системные экраны · PushShade, PushHeadsUp→дизайн push-уведомлений Android (FCM channel, small icon = крест).
