/**
 * Размеры шрифта в px (Tailwind `text-[17px]`, `font-size: 13px` в css) домножаются на `--ui-scale`.
 * Переменная задана в index.css: 1 на планшетах/ПК и на больших телефонах, меньше 1 на узких экранах
 * (iPhone mini/SE, 320–390px). Так интерфейс сжимается плавно, а не только то, что написано в rem.
 * Нижняя граница: текст не уменьшается ниже 10px (или исходного размера, если он меньше), иначе мелкие подписи нечитаемы.
 * Правила с `!important` не трогаем (например, 16px у полей ввода — меньше нельзя, иначе iOS приближает экран).
 */
module.exports = () => ({
  postcssPlugin: 'px-font-scale',
  Declaration: {
    'font-size'(decl) {
      if (decl.important) return;
      const m = /^(\d+(?:\.\d+)?)px$/.exec(decl.value.trim());
      if (!m || Number(m[1]) <= 0) return;
      decl.value = `max(calc(${m[1]}px * var(--ui-scale, 1)), min(${m[1]}px, 10px))`;
    },
  },
});
module.exports.postcss = true;
