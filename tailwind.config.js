/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
        screens: {
            'tall': { 'raw': '(min-height: 520px)' },
        },
        animation: {
            'fast-pulse': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            'pulse-four-times': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) 4'
        },
    },
  },
  plugins: [],
}