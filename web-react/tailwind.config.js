/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        /** Совпадает с Flutter Responsive: phone &lt; 600 */
        shell: '600px',
      },
      colors: {
        primary: {
          DEFAULT: '#7d3640',
          dark: '#5c2830',
        },
      },
    },
  },
  plugins: [],
};
