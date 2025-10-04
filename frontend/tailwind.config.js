/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        surface: '#1e293b',
        accent: '#38bdf8',
        accentMuted: '#0ea5e9'
      },
      boxShadow: {
        glow: '0 10px 40px rgba(14, 165, 233, 0.15)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};
