/**
 * Built-in members roster seed is retired (deleted people came back on rebuild).
 * Historical SQL: scripts/archive/church-roster-seed-2026-03.sql
 * Prefer backup restore: bash scripts/restore.sh <backup-dir>
 */
console.error(
  '[seed-members] Встроенный список участников из кода отключён.\n' +
    '  Удалённые люди больше не должны появляться после пересборки.\n' +
    '  Нужны участники → восстановление из бэкапа или добавление в админке.\n' +
    '  Архив старого списка (только вручную): scripts/archive/church-roster-seed-2026-03.sql',
);
process.exit(1);
