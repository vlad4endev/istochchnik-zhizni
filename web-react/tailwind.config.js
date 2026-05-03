/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
        /** PWA: баннер «На экран Домой» (iOS), центр по X */
        'pwa-ios-install-in': {
          '0%': { opacity: '0', transform: 'translateX(-50%) translateY(16px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateX(-50%) translateY(0) scale(1)' },
        },
        'pwa-android-sheet-in': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pwa-android-pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(125, 54, 64, 0.35)' },
          '50%': { boxShadow: '0 0 0 8px rgba(125, 54, 64, 0)' },
        },
        'pwa-android-check-in': {
          '0%': { transform: 'scale(0.5) rotate(-10deg)', opacity: '0' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        'pwa-notify-banner-in': {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'prayer-fade-up': 'prayer-fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'prayer-fade-in': 'prayer-fade-in 0.4s ease-out both',
        'prayer-header-breathe': 'prayer-header-breathe 10s ease-in-out infinite',
        'pwa-ios-install-in': 'pwa-ios-install-in 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'pwa-android-sheet-in': 'pwa-android-sheet-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pwa-android-pulse-ring': 'pwa-android-pulse-ring 2s ease-in-out infinite',
        'pwa-android-check-in': 'pwa-android-check-in 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'pwa-notify-banner-in': 'pwa-notify-banner-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
