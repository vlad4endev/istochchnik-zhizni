/**
 * Единственный конфиг PostCSS проекта.
 *
 * Раньше их было два: `postcss.config.js` (tailwindcss + autoprefixer) и этот
 * `postcss.config.cjs` (пресет Mantine). `vite.config.ts` указывал `css.postcss` на
 * `.cjs`, но Vite трактует строку как каталог для поиска конфига, а не как путь к
 * файлу, — поэтому `postcss-load-config` находил `postcss.config.js`, и пресет
 * Mantine не выполнялся никогда. Сломанного CSS это не давало только потому, что
 * синтаксис Mantine (`light-dark()`, `rem()`, `@mixin`, `$mantine-breakpoint-*`) в
 * исходниках пока не встречается — то есть мина ждала первого, кто напишет по
 * документации Mantine.
 *
 * Порядок плагинов — как в документации Mantine для связки с Tailwind: пресет и
 * подстановка переменных раскрывают свой синтаксис, затем Tailwind разворачивает
 * `@tailwind`, автопрефиксер идёт последним, чтобы видеть итоговый CSS.
 */
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
    tailwindcss: {},
    autoprefixer: {},
  },
};
