#!/usr/bin/env bash
#
# Сборка релизного APK: веб-бандл -> cap sync -> assembleRelease (R8 + shrinkResources).
# Подпись: android/keystore.properties (см. keystore.properties.example).
# Без keystore.properties release подписывается debug-ключом — обновления встанут
# поверх установленных debug-версий, но мигрировать на свой ключ лучше заранее.
#
set -euo pipefail
cd "$(dirname "$0")/.."

export VITE_RELATIVE_BASE=true
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://app.church-tambov.ru}"

echo "[apk] 1/2 — веб-бандл (tsc + vite + cap sync)…"
npm run build:prod

if [ -f android/keystore.properties ]; then
  echo "[apk] 2/2 — assembleRelease с боевой подписью из android/keystore.properties…"
else
  echo "[apk] ВНИМАНИЕ: android/keystore.properties не найден — подпишу release debug-ключом."
  echo "[apk] Обновления продолжат ставиться поверх текущих debug-сборок, но для собственного"
  echo "[apk] ключа скопируйте android/keystore.properties.example -> keystore.properties и создайте ключ:"
  echo "[apk]   keytool -genkey -v -keystore istochnik-release.jks -alias istochnik -keyalg RSA -keysize 2048 -validity 10000"
  echo "[apk] 2/2 — assembleRelease (debug-подпись, R8 + shrinkResources)…"
fi

(cd android && ./gradlew assembleRelease)

echo
echo "[apk] Готово. Артефакт: android/app/build/outputs/apk/release/"
ls -lh android/app/build/outputs/apk/release/*.apk 2>/dev/null || true
echo "[apk] Дальше: опубликовать APK в админке (Релизы Android) — пуш и баннер обновления уйдут сами."
