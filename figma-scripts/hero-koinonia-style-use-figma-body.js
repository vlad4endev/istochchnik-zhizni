/**
 * Тело скрипта для инструмента use_figma (Figma MCP) или аналога.
 * Файл: "Источник жизни — реклама", fileKey: zQcgbtO43qtZPvq8UoXhYG
 *
 * После лимита Starter: вставьте этот код в вызов use_figma с тем же fileKey,
 * либо попросите агента выполнить вызов снова.
 *
 * Создаёт фрейм «Герой — стиль KOINONIA (1920×1080)» справа от существующих макетов (x≈2500).
 */
const createdNodeIds = [];
const startX = 2500;
const startY = 80;

let serif = { family: "Playfair Display", style: "Bold" };
try {
  await figma.loadFontAsync(serif);
} catch {
  serif = { family: "Merriweather", style: "Bold" };
  await figma.loadFontAsync(serif);
}
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Medium" });

const page = figma.currentPage;

const hero = figma.createFrame();
hero.name = "Герой — стиль KOINONIA (1920×1080)";
hero.resize(1920, 1080);
hero.x = startX;
hero.y = startY;
hero.layoutMode = "NONE";
hero.clipsContent = true;
hero.fills = [
  {
    type: "GRADIENT_LINEAR",
    gradientStops: [
      { position: 0, color: { r: 0.52, g: 0.78, b: 0.94, a: 1 } },
      { position: 0.55, color: { r: 0.72, g: 0.82, b: 0.98, a: 1 } },
      { position: 1, color: { r: 0.76, g: 0.68, b: 0.96, a: 1 } },
    ],
    gradientTransform: [
      [6.123233995736766e-17, 1, 0],
      [-1, 6.123233995736766e-17, 1],
    ],
  },
];
page.appendChild(hero);
createdNodeIds.push(hero.id);

const title = figma.createText();
title.fontName = serif;
title.characters = "ИСТОЧНИК ЖИЗНИ";
title.fontSize = 72;
title.letterSpacing = { unit: "PIXELS", value: 4 };
title.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
title.x = 88;
title.y = 120;
hero.appendChild(title);
createdNodeIds.push(title.id);

const tag = figma.createText();
tag.fontName = { family: "Inter", style: "Regular" };
tag.characters = "Сообщество и общение рядом";
tag.fontSize = 28;
tag.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.92 } }];
tag.x = 88;
tag.y = 218;
hero.appendChild(tag);
createdNodeIds.push(tag.id);

const b1h = figma.createText();
b1h.fontName = { family: "Inter", style: "Bold" };
b1h.characters = "Мессенджер";
b1h.fontSize = 26;
b1h.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
b1h.x = 88;
b1h.y = 320;
hero.appendChild(b1h);
createdNodeIds.push(b1h.id);

const b1t = figma.createText();
b1t.fontName = { family: "Inter", style: "Regular" };
b1t.characters = "личные чаты, группы, каналы и уведомления";
b1t.fontSize = 22;
b1t.lineHeight = { unit: "PIXELS", value: 32 };
b1t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.88 } }];
b1t.x = 88;
b1t.y = 358;
b1t.resize(620, 120);
b1t.textAutoResize = "HEIGHT";
hero.appendChild(b1t);
createdNodeIds.push(b1t.id);

const b2h = figma.createText();
b2h.fontName = { family: "Inter", style: "Bold" };
b2h.characters = "Пространство приложения";
b2h.fontSize = 26;
b2h.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
b2h.x = 88;
b2h.y = 480;
hero.appendChild(b2h);
createdNodeIds.push(b2h.id);

const b2t = figma.createText();
b2t.fontName = { family: "Inter", style: "Regular" };
b2t.characters = "участники, события, медиа, календарь и администрирование";
b2t.fontSize = 22;
b2t.lineHeight = { unit: "PIXELS", value: 32 };
b2t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.88 } }];
b2t.x = 88;
b2t.y = 518;
b2t.resize(620, 140);
b2t.textAutoResize = "HEIGHT";
hero.appendChild(b2t);
createdNodeIds.push(b2t.id);

function phoneShell(name, w, h, screenFill) {
  const shell = figma.createFrame();
  shell.name = name;
  shell.resize(w, h);
  shell.layoutMode = "NONE";
  shell.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.12, b: 0.13 } }];
  shell.cornerRadius = 44;
  shell.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.35 },
      offset: { x: 0, y: 24 },
      radius: 48,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
  const screen = figma.createRectangle();
  screen.resize(w - 20, h - 20);
  screen.x = 10;
  screen.y = 10;
  screen.cornerRadius = 36;
  screen.fills = [{ type: "SOLID", color: screenFill }];
  shell.appendChild(screen);
  const island = figma.createRectangle();
  island.resize(120, 34);
  island.x = (w - 120) / 2;
  island.y = 22;
  island.cornerRadius = 20;
  island.fills = [{ type: "SOLID", color: { r: 0.05, g: 0.05, b: 0.06 } }];
  shell.appendChild(island);
  return { shell, screen, island };
}

const back = phoneShell("Телефон — тёмная тема (задний)", 280, 580, {
  r: 0.11,
  g: 0.11,
  b: 0.12,
});
back.shell.x = 1040;
back.shell.y = 220;
back.shell.rotation = (-6 * Math.PI) / 180;
hero.appendChild(back.shell);
createdNodeIds.push(back.shell.id);

const card1 = figma.createFrame();
card1.resize(232, 64);
card1.x = 34;
card1.y = 86;
card1.cornerRadius = 16;
card1.fills = [{ type: "SOLID", color: { r: 0.17, g: 0.17, b: 0.18 } }];
back.screen.parent.appendChild(card1);
createdNodeIds.push(card1.id);

const c1t = figma.createText();
c1t.fontName = { family: "Inter", style: "Medium" };
c1t.characters = "О сообществе";
c1t.fontSize = 15;
c1t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.95 } }];
c1t.x = 16;
c1t.y = 22;
card1.appendChild(c1t);
createdNodeIds.push(c1t.id);

const card2 = figma.createFrame();
card2.resize(232, 64);
card2.x = 34;
card2.y = 162;
card2.cornerRadius = 16;
card2.fills = [{ type: "SOLID", color: { r: 0.17, g: 0.17, b: 0.18 } }];
back.screen.parent.appendChild(card2);
createdNodeIds.push(card2.id);

const c2t = figma.createText();
c2t.fontName = { family: "Inter", style: "Medium" };
c2t.characters = "События и служения";
c2t.fontSize = 15;
c2t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.95 } }];
c2t.x = 16;
c2t.y = 22;
card2.appendChild(c2t);
createdNodeIds.push(c2t.id);

const pill = figma.createFrame();
pill.resize(200, 40);
pill.x = 50;
pill.y = 244;
pill.cornerRadius = 20;
pill.fills = [{ type: "SOLID", color: { r: 0.0, g: 0.48, b: 1 } }];
back.screen.parent.appendChild(pill);
createdNodeIds.push(pill.id);

const pt = figma.createText();
pt.fontName = { family: "Inter", style: "Medium" };
pt.characters = "Подписаться…";
pt.fontSize = 14;
pt.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
pt.x = 36;
pt.y = 12;
pill.appendChild(pt);
createdNodeIds.push(pt.id);

const nav = figma.createRectangle();
nav.resize(260, 52);
nav.x = 20;
nav.y = 480;
nav.cornerRadius = 0;
nav.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.09 } }];
back.screen.parent.appendChild(nav);
createdNodeIds.push(nav.id);

const front = phoneShell("Телефон — светлая тема (передний)", 320, 640, {
  r: 1,
  g: 1,
  b: 1,
});
front.shell.x = 1240;
front.shell.y = 140;
front.shell.rotation = (4 * Math.PI) / 180;
hero.appendChild(front.shell);
createdNodeIds.push(front.shell.id);

const status = figma.createText();
status.fontName = { family: "Inter", style: "Bold" };
status.characters = "9:41";
status.fontSize = 15;
status.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
status.x = 28;
status.y = 58;
front.screen.parent.appendChild(status);
createdNodeIds.push(status.id);

const tabs = figma.createFrame();
tabs.resize(280, 40);
tabs.x = 20;
tabs.y = 92;
tabs.layoutMode = "HORIZONTAL";
tabs.primaryAxisAlignItems = "MIN";
tabs.counterAxisAlignItems = "CENTER";
tabs.itemSpacing = 8;
tabs.paddingLeft = 6;
tabs.paddingRight = 6;
tabs.paddingTop = 4;
tabs.paddingBottom = 4;
tabs.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.96 } }];
tabs.cornerRadius = 12;
front.screen.parent.appendChild(tabs);
createdNodeIds.push(tabs.id);

async function tabLabel(text, active) {
  await figma.loadFontAsync({ family: "Inter", style: active ? "Bold" : "Regular" });
  const f = figma.createFrame();
  f.layoutMode = "HORIZONTAL";
  f.primaryAxisAlignItems = "CENTER";
  f.counterAxisAlignItems = "CENTER";
  f.paddingLeft = 14;
  f.paddingRight = 14;
  f.paddingTop = 8;
  f.paddingBottom = 8;
  f.cornerRadius = 10;
  f.fills = active ? [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }] : [];
  const t = figma.createText();
  t.fontName = { family: "Inter", style: active ? "Bold" : "Regular" };
  t.characters = text;
  t.fontSize = 13;
  t.fills = [
    {
      type: "SOLID",
      color: active
        ? { r: 0.1, g: 0.1, b: 0.12 }
        : { r: 0.45, g: 0.45, b: 0.48 },
    },
  ];
  f.appendChild(t);
  tabs.appendChild(f);
  f.layoutSizingHorizontal = "HUG";
  f.layoutSizingVertical = "HUG";
  return f.id;
}

await tabLabel("Все", true);
await tabLabel("Служения 5", false);
await tabLabel("Группы", false);

function chatRow(y, name, preview, time, accent) {
  const row = figma.createFrame();
  row.resize(280, 64);
  row.x = 20;
  row.y = y;
  row.layoutMode = "NONE";
  row.fills = [];
  front.screen.parent.appendChild(row);
  const av = figma.createEllipse();
  av.resize(44, 44);
  av.x = 0;
  av.y = 10;
  av.fills = [{ type: "SOLID", color: accent }];
  row.appendChild(av);
  const nm = figma.createText();
  nm.fontName = { family: "Inter", style: "Bold" };
  nm.characters = name;
  nm.fontSize = 15;
  nm.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.1 } }];
  nm.x = 56;
  nm.y = 12;
  row.appendChild(nm);
  const pr = figma.createText();
  pr.fontName = { family: "Inter", style: "Regular" };
  pr.characters = preview;
  pr.fontSize = 13;
  pr.fills = [{ type: "SOLID", color: { r: 0.45, g: 0.45, b: 0.48 } }];
  pr.x = 56;
  pr.y = 34;
  row.appendChild(pr);
  const tm = figma.createText();
  tm.fontName = { family: "Inter", style: "Regular" };
  tm.characters = time;
  tm.fontSize = 12;
  tm.fills = [{ type: "SOLID", color: { r: 0.55, g: 0.55, b: 0.58 } }];
  tm.x = 230;
  tm.y = 14;
  row.appendChild(tm);
  createdNodeIds.push(row.id);
}

chatRow(148, "Наставление", "Голосовое сообщение", "13:32", {
  r: 0.85,
  g: 0.75,
  b: 0.65,
});
chatRow(220, "Группа молитвы", "Видео с встречи", "Сб", {
  r: 0.65,
  g: 0.72,
  b: 0.85,
});
chatRow(292, "Служение", "Напоминание о событии", "Вчера", {
  r: 0.7,
  g: 0.8,
  b: 0.75,
});

return { createdNodeIds, heroId: hero.id };
