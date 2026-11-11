/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        haze: {
          bg: "#0B0E14",
          card: "#121722",
          cardHover: "#161D2C",
          border: "#1E2638",
          borderLight: "#2A364F",
          accent: "#10B981", // Emerald 500
          accentHover: "#059669",
          accentGlow: "rgba(16, 185, 129, 0.15)",
          text: "#F1F5F9",
          muted: "#94A3B8",
          darkMuted: "#475569"
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}
