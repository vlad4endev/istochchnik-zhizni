#!/usr/bin/env node
//
// Поднимает версии сборки в android/app/build.gradle — обязательный шаг перед выпуском APK.
// Баннер «Доступно обновление» показывает обновление только когда versionCode РАСТЁТ.
//
// Использование:
//   npm run android:bump -- 1.27.3           # versionName=1.27.3, versionCode = предыдущий + 1
//   npm run android:bump -- 1.28.0 --code 30 # обе версии явно
//
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const gradlePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../android/app/build.gradle',
);

const args = process.argv.slice(2);
let versionNameArg;
let codeArg;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--code') {
    codeArg = args[i + 1];
    i += 1;
  } else if (!args[i].startsWith('--')) {
    versionNameArg = args[i];
  }
}

if (!versionNameArg) {
  console.error('Использование: npm run android:bump -- <versionName> [--code <versionCode>]');
  console.error('Пример:    npm run android:bump -- 1.27.3');
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, 'utf8');

const codeMatch = /versionCode\s+(\d+)/.exec(gradle);
const nameMatch = /versionName\s+"([^"]*)"/.exec(gradle);
if (!codeMatch || !nameMatch) {
  console.error('Не нашёл versionCode/versionName в android/app/build.gradle');
  process.exit(1);
}
const prevCode = Number(codeMatch[1]);
const prevName = nameMatch[1];

let nextCode;
if (codeArg) {
  nextCode = Number(codeArg);
  if (!Number.isInteger(nextCode) || nextCode <= 0) {
    console.error(`Некорректный --code: ${codeArg}`);
    process.exit(1);
  }
} else {
  nextCode = prevCode + 1;
}

if (nextCode <= prevCode) {
  console.error(
    `versionCode должен расти: было ${prevCode}, пытаются поставить ${nextCode}. ` +
      'Установленные приложения считают код с сервера и не увидят обновления при откате.',
  );
  process.exit(1);
}

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionNameArg}"`);
fs.writeFileSync(gradlePath, gradle);

console.log(`Версия сборки поднята: ${prevName} (code ${prevCode}) -> ${versionNameArg} (code ${nextCode})`);
console.log('Дальше: npm run android:apk и опубликовать APK в админке релизов.');
