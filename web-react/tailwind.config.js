/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      height: {
        dvh: '100dvh',
      },
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
      keyframes: {
        'prayer-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'prayer-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'prayer-header-breathe': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(1.05)' },
        },
      },
      animation: {
        'prayer-fade-up': 'prayer-fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'prayer-fade-in': 'prayer-fade-in 0.4s ease-out both',
        'prayer-header-breathe': 'prayer-header-breathe 10s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
