/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#003D5B',   // Deep Ocean Navy — Structural foundation
          blue: '#30638E',   // Regional Blue — Secondary brand surface
          gold: '#EDAE49',   // Golden Yellow — Bicol accent & active indicators
          coral: '#D1495B',  // Coral Red — Critical conditions & emergencies
        },
        neutral: {
          main: '#F5F8FA',     // Main Background
          surface: '#FFFFFF',  // Surface
          muted: '#EAF1F4',    // Muted Surface
          text: '#153344',     // Primary Text
          secondary: '#607582',// Secondary Text
          border: '#D9E4E9',   // Borders
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}